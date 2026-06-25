import { describe, it, expect } from "vitest";
import {
  parseQnFrame,
  parseLegacyFrame,
  parseAcFrame,
  sumChecksum,
  frameWithChecksum,
  verifyChecksum,
  buildUnitConfigFrame,
  buildTimeSyncFrame,
  secondsSince2000,
} from "./qnProtocol";

const frame = (...bytes: number[]) => Uint8Array.from(bytes);

describe("checksum", () => {
  it("somme les octets modulo 256", () => {
    expect(sumChecksum([0x01, 0x02, 0x03])).toBe(6);
    expect(sumChecksum([0xff, 0x02])).toBe(1); // 257 & 0xff
  });

  it("frameWithChecksum place la somme en dernier octet", () => {
    const f = frameWithChecksum([0x13, 0x09, 0x01]);
    expect(Array.from(f)).toEqual([0x13, 0x09, 0x01, 0x1d]);
  });

  it("verifyChecksum valide une trame correcte et rejette une trame fausse", () => {
    expect(verifyChecksum(frame(0x01, 0x02, 0x03, 0x06))).toBe(true);
    expect(verifyChecksum(frame(0x01, 0x02, 0x03, 0x05))).toBe(false);
    expect(verifyChecksum(frame(0x01))).toBe(null);
  });
});

describe("parseQnFrame", () => {
  it("décode la trame d'info et son diviseur", () => {
    const info = frame(0x12, 0, 0x10, 0, 0, 0, 0, 0, 0, 0, 0x01);
    expect(parseQnFrame(info, 100)).toMatchObject({ kind: "info", divisor: 100 });

    const info10 = frame(0x12, 0, 0x10, 0, 0, 0, 0, 0, 0, 0, 0x00);
    expect(parseQnFrame(info10, 100)).toMatchObject({ kind: "info", divisor: 10 });
  });

  it("décode un poids en direct (BE / diviseur) et l'état de stabilité", () => {
    // 0x1e14 = 7700 -> /100 = 77.00 kg, octet[5]=1 => stable
    const live = frame(0x10, 0, 0, 0x1e, 0x14, 0x01);
    const r = parseQnFrame(live, 100);
    expect(r.kind).toBe("live");
    expect(r.weightKg).toBeCloseTo(77.0, 5);
    expect(r.stable).toBe(true);

    const unstable = frame(0x10, 0, 0, 0x1e, 0x14, 0x00);
    expect(parseQnFrame(unstable, 100).stable).toBe(false);
  });

  it("décode l'enregistrement final avec poids et impédance", () => {
    // poids [10,11] = 0x1e14 = 7700 -> 77.00 ; résistance1 [13,14] LE = 0x0184 = 388
    const rec = frame(0x23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x1e, 0x14, 0, 0x84, 0x01, 0, 0);
    const r = parseQnFrame(rec, 100);
    expect(r.kind).toBe("record");
    expect(r.weightKg).toBeCloseTo(77.0, 5);
    expect(r.impedanceOhms).toBe(388);
    expect(r.stable).toBe(true);
  });

  it("retombe sur la deuxième résistance si la première est nulle", () => {
    const rec = frame(0x23, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x00, 0x64, 0, 0x00, 0x00, 0x90, 0x01);
    expect(parseQnFrame(rec, 100).impedanceOhms).toBe(0x0190); // 400
  });

  it("classe les opcodes inconnus en 'other'", () => {
    expect(parseQnFrame(frame(0x99, 0, 0), 100).kind).toBe("other");
  });
});

describe("parseLegacyFrame (repli)", () => {
  it("décode un poids instable (status 0x2c)", () => {
    const f = frame(0x0d, 0x2c, 0x1e, 0x14);
    expect(parseLegacyFrame(f)).toEqual({ weightKg: 77.0, impedanceOhms: 0, stable: false });
  });

  it("décode un final avec impédance (status 0x24)", () => {
    const f = frame(0x0d, 0x24, 0x1e, 0x14, 0x01, 0x84);
    expect(parseLegacyFrame(f)).toEqual({ weightKg: 77.0, impedanceOhms: 0x0184, stable: true });
  });

  it("renvoie null pour une trame non legacy", () => {
    expect(parseLegacyFrame(frame(0x10, 0, 0))).toBe(null);
  });
});

describe("parseAcFrame (protocole FFB0 / FitTrack Dara, trames réelles capturées)", () => {
  it("décode une trame de poids en cours et valide son checksum", () => {
    // ac 02 00 1e 00 00 ce ec  -> raw 0x001e = 30 -> 3.0 kg (/10), état 0xce (en cours)
    const r = parseAcFrame(frame(0xac, 0x02, 0x00, 0x1e, 0x00, 0x00, 0xce, 0xec));
    expect(r).not.toBeNull();
    expect(r!.kind).toBe("weight");
    expect(r!.raw).toBe(30);
    expect(r!.weightKg).toBeCloseTo(3.0, 5);
    expect(r!.stable).toBe(false);
    expect(r!.checksumOk).toBe(true);
  });

  it("décode un poids > 255 (débordement sur l'octet fort)", () => {
    // ac 02 01 25 00 00 ce f4 -> raw 0x0125 = 293 -> 2.93 kg
    const r = parseAcFrame(frame(0xac, 0x02, 0x01, 0x25, 0x00, 0x00, 0xce, 0xf4));
    expect(r!.raw).toBe(293);
    expect(r!.checksumOk).toBe(true);
  });

  it("marque le poids comme figé quand l'état vaut 0xca", () => {
    // ac 02 01 1b 00 00 ca e6 -> raw 0x011b = 283, état 0xca (figé)
    const r = parseAcFrame(frame(0xac, 0x02, 0x01, 0x1b, 0x00, 0x00, 0xca, 0xe6));
    expect(r!.stable).toBe(true);
    expect(r!.checksumOk).toBe(true);
  });

  it("reconnaît une trame de finalisation (type 0xfd) et en extrait l'impédance", () => {
    // ac 02 fd 01 01 9e cb 68 -> impédance octets [4..5] = 0x019e = 414 Ω
    const r = parseAcFrame(frame(0xac, 0x02, 0xfd, 0x01, 0x01, 0x9e, 0xcb, 0x68));
    expect(r!.kind).toBe("final");
    expect(r!.type).toBe(0xfd);
    expect(r!.impedanceOhms).toBe(0x019e);
    expect(r!.checksumOk).toBe(true);
  });

  it("traite le top-départ d'analyse (fd 00 00) comme une impédance nulle", () => {
    // ac 02 fd 00 00 00 cb c8 -> "analyse qui démarre", impédance pas encore prête
    const r = parseAcFrame(frame(0xac, 0x02, 0xfd, 0x00, 0x00, 0x00, 0xcb, 0xc8));
    expect(r!.kind).toBe("final");
    expect(r!.impedanceOhms).toBe(0);
    expect(r!.checksumOk).toBe(true);
  });

  it("détecte un checksum invalide", () => {
    const r = parseAcFrame(frame(0xac, 0x02, 0x00, 0x1e, 0x00, 0x00, 0xce, 0x00));
    expect(r!.checksumOk).toBe(false);
  });

  it("renvoie null pour une trame non-AC", () => {
    expect(parseAcFrame(frame(0x10, 0x00, 0x00))).toBeNull();
  });
});

describe("trames de handshake", () => {
  it("buildUnitConfigFrame produit l'entête 0x13 et un checksum valide", () => {
    const f = buildUnitConfigFrame(0x05);
    expect(f[0]).toBe(0x13);
    expect(f[2]).toBe(0x05); // protocolType
    expect(f[3]).toBe(0x01); // kg
    expect(verifyChecksum(f)).toBe(true);
  });

  it("buildTimeSyncFrame encode le temps en little-endian avec checksum valide", () => {
    const now = Date.UTC(2000, 0, 1) + 1000 * 1000; // 1000 s après l'époque QN
    const f = buildTimeSyncFrame(0x05, now);
    expect(f[0]).toBe(0x20);
    expect(f[3]).toBe(0xe8); // 1000 & 0xff
    expect(f[4]).toBe(0x03); // 1000 >> 8
    expect(verifyChecksum(f)).toBe(true);
  });

  it("secondsSince2000 est déterministe", () => {
    expect(secondsSince2000(Date.UTC(2000, 0, 1) + 5000)).toBe(5);
  });
});
