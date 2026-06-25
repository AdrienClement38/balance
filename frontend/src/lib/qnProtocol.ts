// =============================================================================
// Protocole QN-Scale (service FFE0) — logique PURE, sans dépendance navigateur.
// Reverse-engineering d'après le driver openScale (QNHandler.kt) :
// github.com/oliexdev/openScale .../bluetooth/scales/QNHandler.kt
//
// Beaucoup de balances QN (dont la FitTrack Dara) n'émettent l'impédance QUE si
// l'application envoie d'abord un handshake de configuration. Ce module fournit le
// décodage des trames et la construction des trames ; le hook React orchestre le BLE.
// =============================================================================

// --- UUIDs « Type 1 » (FFE0..FFE5) ---
export const QN_SERVICE = 0xffe0;
export const QN_NOTIFY = 0xffe1; // notifications (poids, résistances)
export const QN_WRITE_UNIT = 0xffe3; // écriture config / unité (opcode 0x13)
export const QN_WRITE_TIME = 0xffe4; // écriture synchro horaire (0x02 / 0x20)

export const UNIT_KG = 0x01;

// --- Opcodes de trames (premier octet) ---
export const OP_LIVE = 0x10; // poids en direct
export const OP_INFO = 0x12; // info balance (donne le diviseur de poids)
export const OP_UNIT_ACK = 0x14; // accusé de config d'unité -> renvoyer le temps
export const OP_RECORD = 0x23; // enregistrement final (poids + résistances)

/** Somme des octets [start, end) modulo 256 (checksum QN). */
export function sumChecksum(bytes: ArrayLike<number>, start = 0, end?: number): number {
  const last = end ?? bytes.length;
  let sum = 0;
  for (let i = start; i < last; i++) sum = (sum + bytes[i]) & 0xff;
  return sum & 0xff;
}

/** Construit une trame en plaçant en dernier octet le checksum des précédents. */
export function frameWithChecksum(bytes: number[]): Uint8Array {
  return Uint8Array.from([...bytes, sumChecksum(bytes)]);
}

/** Vérifie le checksum d'une trame reçue (dernier octet = somme des précédents). */
export function verifyChecksum(bytes: Uint8Array): boolean | null {
  if (bytes.length < 2) return null;
  return sumChecksum(bytes, 0, bytes.length - 1) === bytes[bytes.length - 1];
}

export interface ParsedFrame {
  opcode: number;
  kind: "live" | "info" | "unit_ack" | "record" | "other";
  weightKg?: number;
  stable?: boolean;
  impedanceOhms?: number;
  divisor?: number;
  checksumOk: boolean | null;
}

/**
 * Décode une trame du protocole QN. Fonction pure (testable hors navigateur).
 * `divisor` provient de la trame OP_INFO (100 ou 10).
 */
export function parseQnFrame(bytes: Uint8Array, divisor: number): ParsedFrame {
  const opcode = bytes[0];
  const checksumOk = verifyChecksum(bytes);

  switch (opcode) {
    case OP_INFO:
      return { opcode, kind: "info", divisor: bytes[10] === 1 ? 100 : 10, checksumOk };
    case OP_LIVE: {
      const raw = (bytes[3] << 8) | bytes[4];
      return {
        opcode,
        kind: "live",
        weightKg: raw / divisor,
        stable: bytes[5] === 1, // octet de stabilité
        checksumOk,
      };
    }
    case OP_UNIT_ACK:
      return { opcode, kind: "unit_ack", checksumOk };
    case OP_RECORD: {
      const raw = (bytes[10] << 8) | bytes[11];
      // Deux résistances en little-endian ; on prend la première non nulle.
      const res1 = bytes[13] | (bytes[14] << 8);
      const res2 = bytes[15] | (bytes[16] << 8);
      return {
        opcode,
        kind: "record",
        weightKg: raw / 100,
        impedanceOhms: res1 || res2 || 0,
        stable: true,
        checksumOk,
      };
    }
    default:
      return { opcode, kind: "other", checksumOk };
  }
}

export interface LegacyFrame {
  weightKg: number;
  impedanceOhms: number;
  stable: boolean;
}

/**
 * Décodeur « legacy » : schéma supposé par la version d'origine du projet.
 * Conservé en repli pour ne PAS casser les balances déjà fonctionnelles dont les
 * trames ne correspondent pas aux opcodes QN standard. Renvoie null si non reconnu.
 */
export function parseLegacyFrame(bytes: Uint8Array): LegacyFrame | null {
  if (bytes[0] !== 0x0d && bytes[0] !== 0xfd) return null;
  const status = bytes[1];
  const weightKg = ((bytes[2] << 8) | bytes[3]) / 100.0;

  if (status === 0x2c || status === 0x20) {
    return { weightKg, impedanceOhms: 0, stable: false };
  }
  if (status === 0x24 || status === 0x22 || status === 0x04) {
    return { weightKg, impedanceOhms: (bytes[4] << 8) | bytes[5], stable: true };
  }
  return null;
}

// =============================================================================
// Protocole "AC" (service FFB0, opcode 0xac) — variante observée sur la FitTrack Dara.
// Trame de 8 octets : ac 02 [poids_hi] [poids_lo] xx xx [état] [checksum]
//   - poids brut = (byte[2] << 8) | byte[3]   (quand byte[2] <= 0x7f)
//   - état byte[6] : 0xce = en cours, 0xca = figé ; byte[2] 0xfd/0xfe = finalisation
//   - checksum byte[7] = somme des octets [2..6] modulo 256
// =============================================================================
export const OP_AC = 0xac;
// Diviseur du poids : 1/10 kg. Confirmé sur le matériel réel (trame 0x00f7 = 247 -> 24,7 kg).
export const AC_WEIGHT_DIVISOR = 10;

export interface AcFrame {
  kind: "weight" | "final";
  weightKg: number;
  stable: boolean;
  raw: number;
  impedanceOhms: number; // (hypothèse) octets [4..5] des trames de finalisation
  type: number; // byte[2]
  phase: number; // byte[6]
  checksumOk: boolean | null;
}

/** Décode une trame du protocole "AC" (FFB0). Renvoie null si ce n'est pas une trame AC. */
export function parseAcFrame(bytes: Uint8Array): AcFrame | null {
  if (bytes[0] !== OP_AC || bytes.length < 8) return null;
  const type = bytes[2];
  const phase = bytes[6];
  const checksumOk = ((bytes[2] + bytes[3] + bytes[4] + bytes[5] + bytes[6]) & 0xff) === bytes[7];

  // Trame de poids : l'octet de poids fort tient sur 0x00..0x7f.
  if (type <= 0x7f) {
    const raw = (type << 8) | bytes[3];
    return {
      kind: "weight",
      weightKg: raw / AC_WEIGHT_DIVISOR,
      stable: phase === 0xca, // 0xce = en cours, 0xca = figé (hypothèse)
      raw,
      impedanceOhms: 0,
      type,
      phase,
      checksumOk,
    };
  }

  // Trame de finalisation (type 0xfd / 0xfe) : poids verrouillé / composition corporelle.
  // Hypothèse : l'impédance est portée par les octets [4..5] (ex. 01 9e -> 414 Ω) — À VALIDER.
  return {
    kind: "final",
    weightKg: 0,
    stable: false,
    raw: 0,
    impedanceOhms: (bytes[4] << 8) | bytes[5],
    type,
    phase,
    checksumOk,
  };
}

/** Représentation hexadécimale lisible d'une trame. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

/** Secondes écoulées depuis le 1ᵉʳ janvier 2000 (référence temps QN). */
export function secondsSince2000(now: number = Date.now()): number {
  return Math.floor((now - Date.UTC(2000, 0, 1)) / 1000);
}

/** Construit la trame de configuration d'unité (handshake qui débloque l'impédance). */
export function buildUnitConfigFrame(protocolType: number, unit: number = UNIT_KG): Uint8Array {
  return frameWithChecksum([0x13, 0x09, protocolType, unit, 0x10, 0x00, 0x00, 0x00, 0x00]);
}

/** Construit la trame de synchro horaire renvoyée après l'accusé de config. */
export function buildTimeSyncFrame(protocolType: number, now: number = Date.now()): Uint8Array {
  const t = secondsSince2000(now);
  return frameWithChecksum([
    0x20,
    0x08,
    protocolType,
    t & 0xff,
    (t >> 8) & 0xff,
    (t >> 16) & 0xff,
    (t >> 24) & 0xff,
    0x00,
  ]);
}
