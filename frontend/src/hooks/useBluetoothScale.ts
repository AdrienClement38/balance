import { useState, useCallback, useRef } from "react";
import {
  QN_SERVICE,
  QN_NOTIFY,
  QN_WRITE_UNIT,
  QN_WRITE_TIME,
  parseQnFrame,
  parseLegacyFrame,
  parseAcFrame,
  buildUnitConfigFrame,
  buildTimeSyncFrame,
  toHex,
} from "../lib/qnProtocol.ts";

export type ConnectionState =
  | "disconnected"
  | "scanning"
  | "connecting"
  | "connected"
  | "stabilizing"
  | "measuring_impedance"
  | "completed"
  | "error";

export interface ScaleMeasurement {
  weightKg: number;
  impedanceOhms: number;
}

/** Une trame brute reçue, conservée pour le diagnostic sur le matériel réel. */
export interface FrameLogEntry {
  ms: number; // millisecondes depuis le début de la connexion
  hex: string; // octets bruts en hexadécimal
  opcode: number; // premier octet
  note: string; // interprétation lisible
  checksumOk: boolean | null; // null si non vérifiable
}

const MAX_LOG = 120; // assez large pour conserver les trames de finalisation d'une pesée complète

// --- Stabilisation du protocole "AC" (FitTrack Dara) ---
// On NE conclut PAS sur un minuteur d'inactivité : on attend que le poids soit réellement
// STABILISÉ (resté dans ±0,1 kg d'une base pendant STABLE_HOLD_MS), puis l'impédance.
const STABLE_HOLD_MS = 1500; // durée pendant laquelle le poids doit rester stable -> verrouillé
const STABLE_TOLERANCE_RAW = 1; // 1 unité brute = 0,1 kg (diviseur /10)
const MIN_BODY_RAW = 100; // 10,0 kg : en dessous, personne n'est (encore) vraiment sur la balance
const IMPEDANCE_WAIT_MS = 8000; // après un poids stabilisé, attente max de l'impédance -> sinon poids seul
const IMPEDANCE_DEBOUNCE_MS = 1000; // après réception de l'impédance, court délai avant de conclure

// Services candidats déclarés à requestDevice (sinon Web Bluetooth bloque leur accès).
// Couvre QN Type 1 (FFE0), QN Type 2 (FFF0), les services GATT standards de pesée,
// et quelques services de modules BLE courants — pour pouvoir découvrir le bon.
const SCALE_SERVICES = [QN_SERVICE, 0xfff0, 0x181d, 0x181b, 0x180f, 0x180a, 0xfee0, 0xfee7, 0xffb0];

/** "0000ffe0-0000-1000-8000-00805f9b34fb" -> "0xffe0" (sinon renvoie l'UUID complet). */
function shortUuid(uuid: string): string {
  const m = /^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/i.exec(uuid);
  return m ? "0x" + m[1].toLowerCase() : uuid;
}

interface ScaleLayout {
  // TOUTES les caractéristiques notifiables retenues, pas une seule.
  // Choisir « la première qui notifie » est un pari sur l'ordre de getCharacteristics(),
  // que la spec ne garantit pas : deux plateformes peuvent le rendre différemment, et on
  // s'abonne alors à une caractéristique muette pendant que les trames passent à côté.
  // S'abonner à toutes coûte quelques opérations GATT et supprime le pari.
  notify: any[];
  writeUnit: any;
  writeTime: any;
}

/**
 * Découvre la disposition GATT réelle de la balance et journalise tout pour diagnostic.
 * Essaie QN Type 1 (FFE0/FFE1 + FFE3/FFE4), puis QN Type 2 (FFF0/FFF1 + FFF2),
 * puis une détection dynamique (1ᵉʳ service offrant une caractéristique de notification).
 */
async function resolveScaleLayout(
  server: any,
  logNote: (note: string) => void
): Promise<ScaleLayout | null> {
  const services: any[] = await server.getPrimaryServices().catch(() => []);
  logNote(`Services : ${services.map((s) => shortUuid(s.uuid)).join(", ") || "(aucun candidat visible)"}`);

  // UNE SEULE découverte par service, réutilisée partout ensuite.
  // Rappeler getCharacteristics() sur un même service peut rendre de NOUVEAUX objets côté
  // Android ; s'abonner sur un objet qui n'est plus celui que la pile BLE a en cache est un
  // moyen connu de rester indéfiniment en suspens — exactement le symptôme observé. Ça
  // économise aussi des allers-retours GATT, précieux tant que la balance ne reste éveillée
  // que quelques secondes.
  const parService = new Map<any, any[]>();
  for (const svc of services) {
    const chars: any[] = await svc.getCharacteristics().catch(() => []);
    parService.set(svc, chars);
    // Les PROPRIÉTÉS sont journalisées, pas seulement les UUID : sans elles, un log de
    // terrain ne dit pas si la caractéristique choisie savait seulement notifier.
    const decrire = (c: any) => {
      const p = c.properties || {};
      const flags = [p.notify && "notify", p.indicate && "indicate", p.write && "write", p.writeWithoutResponse && "writeSR"].filter(Boolean);
      return `${shortUuid(c.uuid)}${flags.length ? ` (${flags.join("/")})` : ""}`;
    };
    logNote(`  ${shortUuid(svc.uuid)} → ${chars.map(decrire).join(", ") || "(aucune)"}`);
  }

  /** Retrouve une caractéristique DANS la liste déjà découverte (jamais un nouvel appel GATT). */
  const trouver = (svc: any, code: number) =>
    (parService.get(svc) || []).find((c) => shortUuid(c.uuid) === `0x${code.toString(16)}`) || null;

  // Type 1 : FFE0/FFE1, écritures séparées FFE3 (unité) et FFE4 (temps).
  const s1 = services.find((s) => shortUuid(s.uuid) === "0xffe0");
  if (s1) {
    const notify = trouver(s1, QN_NOTIFY);
    if (notify) {
      logNote("Disposition QN Type 1 (FFE0) détectée.");
      return {
        notify: [notify],
        writeUnit: trouver(s1, QN_WRITE_UNIT),
        writeTime: trouver(s1, QN_WRITE_TIME),
      };
    }
  }

  // Type 2 : FFF0/FFF1, écriture unique FFF2 (unité + temps).
  const s2 = services.find((s) => shortUuid(s.uuid) === "0xfff0");
  if (s2) {
    const notify = trouver(s2, 0xfff1);
    if (notify) {
      const w = trouver(s2, 0xfff2);
      logNote("Disposition QN Type 2 (FFF0) détectée.");
      return { notify: [notify], writeUnit: w, writeTime: w };
    }
  }

  // Dynamique : TOUTES les caractéristiques notifiables, tous services confondus
  // (+ la première écriture rencontrée, si elle existe).
  const notifiables: any[] = [];
  let write: any = null;
  for (const svc of services) {
    const chars = parService.get(svc) || [];
    const n = chars.filter((c) => c.properties?.notify || c.properties?.indicate);
    if (!n.length) continue;
    notifiables.push(...n);
    // L'écriture est prise DANS LE MÊME service que les notifications, jamais « la
    // première rencontrée tous services confondus » : écrire dans un service étranger
    // (batterie, informations appareil…) ne réveille rien et peut être refusé.
    if (!write) write = chars.find((c) => c.properties?.write || c.properties?.writeWithoutResponse) || null;
  }
  if (notifiables.length) {
    logNote(
      `Disposition dynamique : notify ${notifiables.map((c) => shortUuid(c.uuid)).join(" + ")}${
        write ? ", write " + shortUuid(write.uuid) : ""
      }.`
    );
    return { notify: notifiables, writeUnit: write, writeTime: write };
  }

  return null;
}

export function useBluetoothScale() {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [currentWeight, setCurrentWeight] = useState<number>(0);
  const [currentImpedance, setCurrentImpedance] = useState<number>(0);
  const [finalMeasurement, setFinalMeasurement] = useState<ScaleMeasurement | null>(null);
  const [frameLog, setFrameLog] = useState<FrameLogEntry[]>([]);

  const gattServerRef = useRef<any | null>(null);
  const deviceRef = useRef<any | null>(null); // appareil sélectionné, réutilisé dans la session
  const listenerDeviceRef = useRef<any | null>(null); // appareil sur lequel le listener est déjà posé
  const writeUnitRef = useRef<any | null>(null);
  const writeTimeRef = useRef<any | null>(null);
  const divisorRef = useRef<number>(100);
  const protocolTypeRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const completedRef = useRef<boolean>(false);
  const stableWeightRef = useRef<number>(0); // poids stabilisé VERROUILLÉ (0 = pas encore stable)
  const stableBaselineRef = useRef<number>(0); // poids brut de référence pour mesurer la dérive
  const liveWeightKgRef = useRef<number>(0); // dernier poids en direct (capturé à la stabilisation)
  const acImpedanceRef = useRef<number>(0); // impédance plausible décodée des trames de finalisation AC
  const impedanceTimerRef = useRef<number | undefined>(undefined);
  const settleTimerRef = useRef<number | undefined>(undefined);
  const userClosingRef = useRef<boolean>(false); // déconnexion volontaire (pas une erreur)

  const log = useCallback((bytes: Uint8Array, note: string, checksumOk: boolean | null) => {
    const entry: FrameLogEntry = {
      ms: startTimeRef.current ? Date.now() - startTimeRef.current : 0,
      hex: toHex(bytes),
      opcode: bytes[0],
      note,
      checksumOk,
    };
    console.log(`[balance] ${entry.ms}ms ${entry.hex} → ${note}`);
    setFrameLog((prev) => [...prev.slice(-(MAX_LOG - 1)), entry]);
  }, []);

  // Journalise une note (sans trame brute) — utilisé pour la découverte des services.
  const logNote = useCallback((note: string) => {
    const entry: FrameLogEntry = {
      ms: startTimeRef.current ? Date.now() - startTimeRef.current : 0,
      hex: "",
      opcode: -1,
      note,
      checksumOk: null,
    };
    console.log(`[balance] ${entry.ms}ms — ${note}`);
    setFrameLog((prev) => [...prev.slice(-(MAX_LOG - 1)), entry]);
  }, []);

  const clearTimers = () => {
    if (impedanceTimerRef.current !== undefined) {
      clearTimeout(impedanceTimerRef.current);
      impedanceTimerRef.current = undefined;
    }
    if (settleTimerRef.current !== undefined) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = undefined;
    }
  };

  const disconnect = useCallback(() => {
    clearTimers();
    userClosingRef.current = true; // déconnexion volontaire -> ne pas la traiter en erreur
    if (gattServerRef.current && gattServerRef.current.connected) {
      gattServerRef.current.disconnect();
    }
    setConnectionState("disconnected");
    setCurrentWeight(0);
    setCurrentImpedance(0);
    setFinalMeasurement(null);
  }, []);

  const complete = useCallback((weightKg: number, impedanceOhms: number) => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearTimers();
    setCurrentWeight(weightKg);
    setCurrentImpedance(impedanceOhms);
    setFinalMeasurement({ weightKg, impedanceOhms });
    setConnectionState("completed");
    if (gattServerRef.current && gattServerRef.current.connected) {
      gattServerRef.current.disconnect();
    }
  }, []);

  /** Écrit une trame sur une caractéristique, sans bloquer si elle est absente. */
  const safeWrite = useCallback(
    async (charRef: any, frame: Uint8Array, label: string) => {
      if (!charRef) return;
      try {
        if (charRef.writeValueWithoutResponse) {
          await charRef.writeValueWithoutResponse(frame);
        } else {
          await charRef.writeValue(frame);
        }
        log(frame, `→ envoi ${label}`, true);
      } catch (err) {
        console.warn(`[balance] écriture ${label} impossible :`, err);
      }
    },
    [log]
  );

  const handleFrame = useCallback(
    (value: DataView) => {
      const bytes = new Uint8Array(value.buffer);
      if (bytes.length === 0) return;

      const qn = parseQnFrame(bytes, divisorRef.current);

      // 1) Trame d'info : fixe le diviseur puis déclenche le handshake de config.
      if (qn.kind === "info") {
        divisorRef.current = qn.divisor ?? 100;
        protocolTypeRef.current = bytes[2] ?? 0;
        log(bytes, `info balance (diviseur=${divisorRef.current})`, qn.checksumOk);
        // Handshake : configuration d'unité (kg) -> débloque la bio-impédance.
        void safeWrite(
          writeUnitRef.current,
          buildUnitConfigFrame(protocolTypeRef.current),
          "config unité (0x13)"
        );
        return;
      }

      // 2) Accusé de config -> on renvoie la synchro horaire.
      if (qn.kind === "unit_ack") {
        log(bytes, "accusé config unité (0x14)", qn.checksumOk);
        void safeWrite(
          writeTimeRef.current,
          buildTimeSyncFrame(protocolTypeRef.current),
          "synchro horaire (0x20)"
        );
        return;
      }

      // 3) Poids en direct.
      if (qn.kind === "live" && qn.weightKg !== undefined) {
        setCurrentWeight(qn.weightKg);
        if (qn.stable) {
          stableWeightRef.current = qn.weightKg;
          setConnectionState("measuring_impedance");
          log(bytes, `poids stable ${qn.weightKg.toFixed(2)} kg, attente impédance`, qn.checksumOk);
          // Si l'impédance n'arrive pas, on conclut au poids seul après un délai.
          if (impedanceTimerRef.current === undefined) {
            impedanceTimerRef.current = window.setTimeout(() => {
              complete(stableWeightRef.current, 0);
            }, IMPEDANCE_WAIT_MS);
          }
        } else {
          setConnectionState("stabilizing");
          log(bytes, `poids en cours ${qn.weightKg.toFixed(2)} kg`, qn.checksumOk);
        }
        return;
      }

      // 4) Enregistrement final avec résistances -> mesure complète.
      if (qn.kind === "record" && qn.weightKg !== undefined) {
        const impedance = qn.impedanceOhms ?? 0;
        log(
          bytes,
          `enregistrement : ${qn.weightKg.toFixed(2)} kg, impédance ${impedance} Ω`,
          qn.checksumOk
        );
        if (impedance > 0) setCurrentImpedance(impedance);
        complete(qn.weightKg, impedance);
        return;
      }

      // 5) Protocole "AC" (FitTrack Dara, service FFB0, opcode 0xac).
      const ac = parseAcFrame(bytes);
      if (ac) {
        // Programme la conclusion de la pesée (poids stabilisé + impédance retenue).
        const finishWith = (delayMs: number) => {
          if (impedanceTimerRef.current !== undefined) clearTimeout(impedanceTimerRef.current);
          impedanceTimerRef.current = window.setTimeout(
            () => complete(stableWeightRef.current, acImpedanceRef.current),
            delayMs
          );
        };

        if (ac.kind === "weight") {
          setCurrentWeight(ac.weightKg);
          liveWeightKgRef.current = ac.weightKg;
          log(bytes, `[AC] poids ${ac.weightKg.toFixed(1)} kg`, ac.checksumOk);

          // Personne pas (encore) vraiment sur la balance -> on ne stabilise pas.
          if (ac.raw < MIN_BODY_RAW) return;

          // STABILISATION : le poids doit rester dans ±0,1 kg d'une base de référence
          // pendant STABLE_HOLD_MS. On (re)lance le minuteur dès que la dérive dépasse la
          // tolérance ; tant qu'il n'a pas expiré, le poids n'est PAS considéré stable.
          if (stableWeightRef.current === 0) {
            const drift = Math.abs(ac.raw - stableBaselineRef.current);
            if (settleTimerRef.current === undefined || drift > STABLE_TOLERANCE_RAW) {
              stableBaselineRef.current = ac.raw; // nouvelle base de référence
              setConnectionState("stabilizing");
              if (settleTimerRef.current !== undefined) clearTimeout(settleTimerRef.current);
              settleTimerRef.current = window.setTimeout(() => {
                settleTimerRef.current = undefined;
                if (completedRef.current || stableWeightRef.current !== 0) return;
                // Poids verrouillé sur la valeur stabilisée courante.
                stableWeightRef.current = liveWeightKgRef.current;
                setConnectionState("measuring_impedance");
                log(bytes, `[AC] poids stabilisé à ${stableWeightRef.current.toFixed(1)} kg`, ac.checksumOk);
                // Impédance déjà reçue -> conclure ; sinon l'attendre puis conclure en poids seul.
                finishWith(acImpedanceRef.current > 0 ? IMPEDANCE_DEBOUNCE_MS : IMPEDANCE_WAIT_MS);
              }, STABLE_HOLD_MS);
            }
            // sinon : dans la tolérance -> on laisse le minuteur de stabilisation courir.
          }
          return;
        }

        // Trame de finalisation : impédance (déjà filtrée sur une plage plausible ; 0 sinon).
        if (ac.impedanceOhms > 0) {
          acImpedanceRef.current = ac.impedanceOhms;
          setCurrentImpedance(ac.impedanceOhms);
          log(bytes, `[AC] impédance ${ac.impedanceOhms} Ω`, ac.checksumOk);
          // Si le poids est déjà stabilisé, on conclut (petit délai pour une éventuelle MAJ).
          if (stableWeightRef.current > 0) {
            setConnectionState("measuring_impedance");
            finishWith(IMPEDANCE_DEBOUNCE_MS);
          }
          // sinon : on garde l'impédance, la stabilisation du poids l'utilisera.
        } else {
          log(bytes, `[AC] analyse en cours (type 0x${ac.type.toString(16)})…`, ac.checksumOk);
        }
        return;
      }

      // 6) Repli legacy pour les balances aux trames non standard.
      const legacy = parseLegacyFrame(bytes);
      if (legacy) {
        setCurrentWeight(legacy.weightKg);
        if (!legacy.stable) {
          setConnectionState("stabilizing");
          log(bytes, `[legacy] poids ${legacy.weightKg.toFixed(2)} kg`, qn.checksumOk);
        } else if (legacy.impedanceOhms === 0) {
          setConnectionState("measuring_impedance");
          log(bytes, "[legacy] poids stable, attente impédance", qn.checksumOk);
        } else {
          log(
            bytes,
            `[legacy] final ${legacy.weightKg.toFixed(2)} kg, ${legacy.impedanceOhms} Ω`,
            qn.checksumOk
          );
          setCurrentImpedance(legacy.impedanceOhms);
          complete(legacy.weightKg, legacy.impedanceOhms);
        }
        return;
      }

      // 6) Trame inconnue : on la journalise pour diagnostic.
      log(bytes, `trame non reconnue (opcode 0x${qn.opcode.toString(16)})`, qn.checksumOk);
    },
    [complete, log, safeWrite]
  );

  const connect = useCallback(async () => {
    setErrorMsg(null);
    setConnectionState("scanning");
    setCurrentWeight(0);
    setCurrentImpedance(0);
    setFinalMeasurement(null);
    setFrameLog([]);
    completedRef.current = false;
    userClosingRef.current = false;
    stableWeightRef.current = 0;
    stableBaselineRef.current = 0;
    liveWeightKgRef.current = 0;
    acImpedanceRef.current = 0;
    divisorRef.current = 100;

    const nav = navigator as any;

    // iOS/iPadOS : Apple impose le moteur WebKit à TOUS les navigateurs (Safari ET Chrome),
    // et WebKit ne gère pas le Web Bluetooth. Ce n'est pas un bug de l'app : c'est bloqué côté OS.
    const ua = navigator.userAgent || "";
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);

    if (!nav.bluetooth) {
      setConnectionState("error");
      setErrorMsg(
        isIOS
          ? "Sur iPhone/iPad, aucun navigateur (Safari comme Chrome) ne gère le Bluetooth Web — c'est une limitation d'Apple, pas un bug de l'app. Solution : installe l'app gratuite « Bluefy – Web BLE Browser » depuis l'App Store, puis ouvre ce site DANS Bluefy. (Sinon, un téléphone Android ou un PC sous Chrome fonctionnent directement.)"
          : "L'API Web Bluetooth n'est pas supportée ou activée sur ce navigateur. Utilisez Chrome/Edge/Opera en HTTPS (le Bluetooth Web n'existe pas sur iOS)."
      );
      return;
    }

    try {
      // 1. Réutiliser l'appareil déjà sélectionné pendant cette session : pas de re-sélection.
      //    (gatt.connect() sur un appareil connu n'exige ni geste utilisateur ni sélecteur.)
      let device: any = deviceRef.current;

      // 2. Sinon, tenter un appareil déjà autorisé par Chrome (permissions persistantes,
      //    nécessite les flags Chrome — voir README).
      if (!device && nav.bluetooth.getDevices) {
        const permitted = await nav.bluetooth.getDevices();
        device =
          permitted.find(
            (d: any) =>
              d.name?.startsWith("QN-Scale") ||
              d.name?.startsWith("QNScale") ||
              d.name?.toLowerCase().includes("track") ||
              d.name?.toLowerCase().includes("dara")
          ) || null;
        if (device) console.log("[balance] balance déjà autorisée :", device.name);
      }

      // 3. Sinon, ouvrir le sélecteur (geste utilisateur requis, une seule fois).
      if (!device) {
        device = await nav.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: SCALE_SERVICES,
        });
      }

      deviceRef.current = device; // mémoriser pour les prochaines pesées

      setConnectionState("connecting");
      startTimeRef.current = Date.now();

      // Poser le listener une seule fois par appareil (évite les listeners empilés à la réutilisation).
      if (listenerDeviceRef.current !== device) {
        listenerDeviceRef.current = device;
        device.addEventListener("gattserverdisconnected", () => {
          console.log("[balance] balance déconnectée.");
          if (completedRef.current) return; // fin normale après une pesée réussie
          clearTimers();
          if (!userClosingRef.current && stableWeightRef.current > 0) {
            // Déconnexion EN PLEINE pesée -> message explicite (évite le « ça plante sans message »).
            setErrorMsg(
              "La balance s'est déconnectée avant la fin de la pesée. Restez bien immobile sur la balance jusqu'à l'affichage du résultat, puis relancez une pesée."
            );
            setConnectionState("error");
          } else {
            setConnectionState("disconnected");
          }
        });
      }

      const server = await device.gatt?.connect();
      if (!server) throw new Error("Impossible de se connecter au serveur GATT de la balance.");
      gattServerRef.current = server;
      setConnectionState("connected");

      // Découvrir la disposition GATT réelle (FFE0 Type 1, FFF0 Type 2, ou dynamique)
      // et journaliser les services/caractéristiques pour diagnostic.
      const layout = await resolveScaleLayout(server, logNote);
      if (!layout || layout.notify.length === 0) {
        throw new Error(
          "Aucun service de balance compatible trouvé. Ouvrez le panneau Diagnostic et envoyez-moi la liste des services."
        );
      }
      writeUnitRef.current = layout.writeUnit;
      writeTimeRef.current = layout.writeTime;

      // ⚠️ Le listener est posé AVANT `startNotifications()`, et c'est capital.
      // Posé après, un abonnement qui aboutit tardivement (Android peut mettre plus de
      // 5 s) est bel et bien actif côté pile, mais l'app n'écoute pas encore : les trames
      // arrivent et sont jetées. On croyait la balance muette alors qu'elle parlait.
      // Poser le listener d'abord ne coûte rien : sans abonnement, il ne se déclenche pas.
      for (const c of layout.notify) {
        c.addEventListener("characteristicvaluechanged", (event: any) => {
          const v = event.target?.value as DataView | undefined;
          if (v) handleFrame(v);
        });
      }

      // Descripteurs journalisés AVANT toute tentative : `startNotifications()` doit écrire
      // le descripteur CCCD (0x2902). Son ABSENCE, ou un accès qui exige un lien chiffré,
      // est la cause connue d'un abonnement qui n'aboutit jamais sur Android alors qu'il
      // passe sur Windows. Sans cette ligne dans le journal, on ne peut que supposer.
      for (const c of layout.notify) {
        const ds: any[] = await c.getDescriptors?.().catch(() => []) ?? [];
        logNote(
          `  descripteurs de ${shortUuid(c.uuid)} : ${ds.map((d) => shortUuid(d.uuid)).join(", ") || "(AUCUN — notifications impossibles à activer)"}`
        );
      }

      let abonnees = 0;
      let fileBloquee = false;
      for (let i = 0; i < layout.notify.length; i++) {
        const c = layout.notify[i];
        let minuteur: number | undefined;
        try {
          // Un `Promise.race` abandonne l'ATTENTE, jamais l'opération GATT elle-même :
          // l'écriture du descripteur reste en tête de file côté Android. Le minuteur est
          // donc un simple garde-fou d'interface, pas une annulation.
          await Promise.race([
            c.startNotifications(),
            new Promise((_, rej) => {
              minuteur = window.setTimeout(() => rej(new Error("délai dépassé (6 s)")), 6000);
            }),
          ]);
          abonnees++;
          fileBloquee = false;
          logNote(`Notifications actives sur ${shortUuid(c.uuid)}.`);
        } catch (e: any) {
          const lien = server?.connected ? "lien encore actif" : "LIEN DÉJÀ COUPÉ";
          logNote(
            `Notifications REFUSÉES sur ${shortUuid(c.uuid)} : ${e?.name || "Error"} — ${e?.message || e} [${lien}]`
          );
          if (/délai dépassé/.test(e?.message || "")) {
            fileBloquee = true;
            // L'opération est toujours en file : la caractéristique suivante attendrait
            // derrière elle et échouerait identiquement. La SEULE façon de lui laisser sa
            // chance est de repartir d'un lien neuf — se contenter d'abandonner (ce que je
            // faisais) ne testait jamais la seconde.
            if (i < layout.notify.length - 1) {
              try {
                if (server?.connected) server.disconnect();
                logNote("File GATT bloquée → reconnexion avant d'essayer la suivante.");
                await deviceRef.current.gatt.connect();
              } catch (re: any) {
                logNote(`Reconnexion impossible : ${re?.message || re}`);
                break;
              }
            }
          }
        } finally {
          // Sans ça, le minuteur d'un abonnement RÉUSSI continue de courir et rejette dans
          // le vide quelques secondes plus tard.
          if (minuteur !== undefined) clearTimeout(minuteur);
        }
      }

      if (abonnees === 0) {
        // La pile GATT est laissée dans un état inutilisable : on coupe explicitement pour
        // que la tentative suivante reparte d'un lien neuf.
        try {
          if (server?.connected) server.disconnect();
        } catch {
          /* déjà fermé */
        }
        throw new Error(
          fileBloquee
            ? "La balance accepte la connexion mais ne confirme jamais l'activation de ses notifications. Ce blocage vient d'Android, pas de la balance : essayez de l'APPAIRER dans les réglages Bluetooth du téléphone (certaines balances exigent un lien chiffré), puis relancez. Ouvrez le Diagnostic et envoyez-le-moi si ça persiste."
            : "La balance s'est déconnectée avant d'avoir pu envoyer ses mesures : elle se rendort en quelques secondes. Remontez dessus pour la réveiller, puis relancez la pesée sans attendre."
        );
      }
      logNote(`Notifications activées (${abonnees}/${layout.notify.length}). En attente de pesée…`);
    } catch (err: any) {
      const name = err?.name || "Error";
      const message = err?.message || String(err);
      console.error(`[balance] erreur Web Bluetooth : ${name}: ${message}`);
      setConnectionState("error");

      // Cas 1 : l'utilisateur a fermé le sélecteur sans rien choisir.
      if (name === "NotFoundError" && /cancel/i.test(message)) {
        setErrorMsg(
          "Aucune balance sélectionnée. Réveillez d'abord la balance (montez brièvement dessus pour qu'elle s'allume), cliquez à nouveau sur « Lancer une pesée », puis choisissez-la dans la liste."
        );
        return;
      }

      // Cas 2 : échec de connexion GATT — souvent un autre central tient la balance,
      // ou un appairage Windows figé.
      if (name === "NetworkError" || /gatt|disconnected/i.test(message)) {
        deviceRef.current = null; // autoriser une nouvelle sélection au prochain essai
        setErrorMsg(
          "Connexion à la balance impossible. Causes fréquentes : une autre app la détient déjà (coupez le Bluetooth du téléphone / fermez l'app FitTrack), ou elle est figée dans l'appairage Windows (Paramètres > Bluetooth > Retirer l'appareil). Réveillez la balance et réessayez."
        );
        return;
      }

      // Cas 3 : service/caractéristique introuvable (modèle de protocole différent) ou autre.
      setErrorMsg(`Bluetooth (${name}) : ${message}`);
    }
  }, [handleFrame]);

  return {
    connectionState,
    errorMsg,
    currentWeight,
    currentImpedance,
    finalMeasurement,
    frameLog,
    connect,
    disconnect,
  };
}
