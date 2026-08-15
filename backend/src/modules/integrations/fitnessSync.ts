/**
 * Poussée automatique des pesées vers l'app fitness (AC-KINETIK).
 *
 * Principe : à chaque pesée enregistrée (et à chaque suppression), le backend Balance
 * appelle en serveur-à-serveur l'endpoint d'ingestion d'AC-KINETIK, qui dépose la donnée
 * dans le store de synchronisation du compte correspondant. Elle apparaît alors sur tous
 * les appareils de la personne, en temps réel, sans qu'elle ait rien à faire.
 *
 * Sécurité :
 *  - HTTPS + secret partagé, jamais transmis en clair : le corps est signé en
 *    HMAC-SHA256 (`X-Balance-Signature`), la signature couvrant `timestamp.corps`.
 *  - Horodatage (`X-Balance-Timestamp`) : le receveur refuse au-delà de sa fenêtre,
 *    ce qui rend une trame rejouée inutilisable.
 *  - Liste blanche d'emails (`FITNESS_SYNC_EMAILS`) côté Balance, DOUBLÉE côté
 *    AC-KINETIK par un contrôle sur ADMIN_EMAILS. Aucun autre compte n'est jamais
 *    poussé, même si la configuration dérape d'un côté.
 *
 * Robustesse : la poussée est un effet de bord BEST-EFFORT, déclenché après la réponse
 * HTTP. Elle ne peut ni ralentir ni faire échouer une pesée — une panne de l'app fitness
 * ne doit jamais empêcher de se peser. Après 3 tentatives infructueuses, l'échec est
 * tracé dans le journal d'erreurs du profil (code `fitness_sync_failed`), donc visible
 * dans l'UI Balance sans avoir à ouvrir les logs du serveur.
 */
import { createHmac } from "crypto";

/** Journal minimal (compatible FastifyBaseLogger). */
interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export interface WeighInComposition {
  fatPct: number | null;
  musclePct: number | null;
  waterPct: number | null;
  boneMassKg: number | null;
  bmr: number | null;
  visceralFat: number | null;
}

export interface WeighInPayload {
  measurementId: string;
  /** Instant de la pesée, ISO complet. */
  measuredAt: string;
  weightKg: number;
  composition: WeighInComposition | null;
}

const ATTEMPTS = 3;
const ATTEMPT_TIMEOUT_MS = 5000;
const BACKOFF_MS = [0, 1000, 4000];

/** Comptes Balance dont les pesées sont poussées (emails, séparés par des virgules). */
export const fitnessSyncEmails = (): string[] =>
  (process.env.FITNESS_SYNC_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

/** L'intégration est active si l'URL, le secret ET au moins un email sont configurés. */
export function fitnessSyncConfigured(): boolean {
  return Boolean(process.env.FITNESS_SYNC_URL && process.env.FITNESS_SYNC_SECRET && fitnessSyncEmails().length);
}

/** Ce compte doit-il être synchronisé ? (Faux si l'intégration n'est pas configurée.) */
export function shouldSync(email: string | undefined | null): boolean {
  if (!email || !fitnessSyncConfigured()) return false;
  return fitnessSyncEmails().includes(email.trim().toLowerCase());
}

/** Signature du corps : HMAC-SHA256 de `timestamp.corps`, en hexadécimal. */
export function signBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

async function postSigned(rawBody: string): Promise<void> {
  const url = process.env.FITNESS_SYNC_URL as string;
  const secret = process.env.FITNESS_SYNC_SECRET as string;
  const timestamp = Date.now().toString();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Balance-Timestamp": timestamp,
      "X-Balance-Signature": signBody(secret, timestamp, rawBody),
    },
    body: rawBody,
    signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }
}

/**
 * Envoie avec quelques tentatives espacées, puis journalise l'échec en base.
 * Ne rejette JAMAIS : c'est le contrat de l'appel « fire-and-forget » côté contrôleur.
 */
async function sendBestEffort(body: unknown, profileId: string, log: Logger): Promise<void> {
  const rawBody = JSON.stringify(body);
  let lastError = "";

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt]) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    try {
      await postSigned(rawBody);
      if (attempt > 0) log.info(`[fitness-sync] Poussée réussie à la tentative ${attempt + 1}.`);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log.warn(`[fitness-sync] Tentative ${attempt + 1}/${ATTEMPTS} échouée : ${lastError}`);
    }
  }

  log.error(`[fitness-sync] Abandon après ${ATTEMPTS} tentatives : ${lastError}`);
  try {
    // Import PARESSEUX volontaire : `config/db.js` instancie PGlite au chargement du module.
    // Un import statique ici ouvrirait la base de développement rien qu'en important ce
    // fichier — y compris depuis les tests unitaires, qui resteraient alors suspendus (et,
    // PGlite n'acceptant qu'un seul écrivain, entreraient en conflit avec le serveur de dev).
    const [{ db }, { errorLogs }] = await Promise.all([import("../../config/db.js"), import("../../db/schema.js")]);
    await db.insert(errorLogs).values({
      profileId,
      code: "fitness_sync_failed",
      message: `Envoi vers l'app fitness impossible : ${lastError}`.slice(0, 500),
    });
  } catch (err) {
    // Le journal d'erreurs est un confort de diagnostic : s'il tombe aussi, on n'insiste pas.
    log.error(`[fitness-sync] Journalisation de l'échec impossible : ${(err as Error).message}`);
  }
}

/** Pousse une pesée. À appeler sans `await` (effet de bord après réponse). */
export function syncWeighIn(email: string, profileId: string, payload: WeighInPayload, log: Logger): void {
  if (!shouldSync(email)) return;
  void sendBestEffort({ email: email.trim().toLowerCase(), deleted: false, ...payload }, profileId, log);
}

/** Pousse la suppression d'une pesée (l'entrée disparaît aussi côté fitness). */
export function syncDeletion(email: string, profileId: string, measurementId: string, log: Logger): void {
  if (!shouldSync(email)) return;
  void sendBestEffort({ email: email.trim().toLowerCase(), deleted: true, measurementId }, profileId, log);
}
