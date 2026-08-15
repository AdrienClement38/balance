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
import { broadcastToUser } from "../../config/websocket.js";

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

// Fenêtre volontairement large : sur le forfait gratuit AlwaysData, l'app fitness peut être
// ENDORMIE et mettre plusieurs dizaines de secondes à répondre à la première requête. Une
// fenêtre courte transformait ce réveil à froid — le cas le plus banal, la première pesée de
// la journée — en échec. 4 tentatives réparties sur ~60 s, 10 s de patience chacune.
const ATTEMPTS = 4;
const ATTEMPT_TIMEOUT_MS = 10000;
const BACKOFF_MS = [0, 2000, 8000, 20000];

/** Pesées rejouées au maximum par passe de rattrapage (borne le travail et les appels). */
const CATCHUP_LIMIT = 50;
/** Au-delà, on ne rejoue plus : une pesée trop vieille n'a plus d'intérêt à remonter. */
const CATCHUP_MAX_AGE_DAYS = 30;

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

/**
 * Compte DESTINATAIRE côté app fitness.
 *
 * Les deux applications ont chacune leurs comptes, et rien n'oblige à s'y être inscrit avec la
 * même adresse. `FITNESS_SYNC_EMAILS` dit QUI DÉCLENCHE l'envoi (un compte Balance) ;
 * `FITNESS_SYNC_TARGET_EMAIL` dit OÙ ÇA ATTERRIT (un compte fitness). Sans cette seconde
 * variable, on envoyait l'adresse de l'émetteur : si elle n'existe pas côté fitness, la pesée
 * était acceptée poliment et jetée.
 *
 * Non définie -> on retombe sur l'adresse de l'émetteur (cas où c'est la même des deux côtés).
 */
export const fitnessSyncTargetEmail = (senderEmail: string): string =>
  (process.env.FITNESS_SYNC_TARGET_EMAIL || senderEmail).trim().toLowerCase();

/** Ce compte doit-il être synchronisé ? (Faux si l'intégration n'est pas configurée.) */
export function shouldSync(email: string | undefined | null): boolean {
  if (!email || !fitnessSyncConfigured()) return false;
  return fitnessSyncEmails().includes(email.trim().toLowerCase());
}

/** Signature du corps : HMAC-SHA256 de `timestamp.corps`, en hexadécimal. */
export function signBody(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

/**
 * `applied: false` = l'app fitness a bien reçu et validé la trame, mais n'a trouvé AUCUN compte
 * pour l'adresse visée. Ce n'est pas une panne (réessayer n'y changera rien) mais ce n'est
 * surtout pas un succès : c'est une erreur de configuration qui doit se voir.
 */
type SendOutcome = "ok" | "compte-introuvable" | "echec";

async function postSigned(rawBody: string): Promise<{ applied: boolean }> {
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
  const data = (await res.json().catch(() => null)) as { applied?: boolean } | null;
  // Absence du champ = version plus ancienne de l'app fitness : on lui fait confiance.
  return { applied: data?.applied !== false };
}

/**
 * Trace un échec dans le journal d'erreurs du profil, donc visible dans l'app Balance sans
 * avoir à ouvrir les logs du serveur. Best-effort : si la base tombe aussi, on n'insiste pas.
 */
async function journaliserEchec(profileId: string, message: string, log: Logger): Promise<void> {
  try {
    // Import PARESSEUX volontaire : `config/db.js` instancie PGlite au chargement du module.
    // Un import statique ici ouvrirait la base de développement rien qu'en important ce
    // fichier — y compris depuis les tests unitaires, qui resteraient alors suspendus (et,
    // PGlite n'acceptant qu'un seul écrivain, entreraient en conflit avec le serveur de dev).
    const [{ db }, { errorLogs }] = await Promise.all([import("../../config/db.js"), import("../../db/schema.js")]);
    await db.insert(errorLogs).values({
      profileId,
      code: "fitness_sync_failed",
      message: message.slice(0, 500),
    });
  } catch (err) {
    log.error(`[fitness-sync] Journalisation de l'échec impossible : ${(err as Error).message}`);
  }
}

/**
 * Envoie avec quelques tentatives espacées, puis journalise l'échec en base.
 * Ne rejette JAMAIS : c'est le contrat de l'appel « fire-and-forget » côté contrôleur.
 */
async function sendBestEffort(body: unknown, profileId: string, log: Logger): Promise<SendOutcome> {
  const rawBody = JSON.stringify(body);
  let lastError = "";

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt]) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    try {
      const { applied } = await postSigned(rawBody);
      if (!applied) {
        // Inutile de réessayer : la trame est valide, c'est la CIBLE qui n'existe pas.
        const message =
          "L'app fitness ne connaît aucun compte pour l'adresse visée : la pesée n'a pas été enregistrée là-bas. " +
          "Vérifie FITNESS_SYNC_TARGET_EMAIL (côté Balance) et ADMIN_EMAILS (côté fitness).";
        log.error(`[fitness-sync] ${message}`);
        await journaliserEchec(profileId, message, log);
        return "compte-introuvable";
      }
      if (attempt > 0) log.info(`[fitness-sync] Poussée réussie à la tentative ${attempt + 1}.`);
      return "ok";
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      log.warn(`[fitness-sync] Tentative ${attempt + 1}/${ATTEMPTS} échouée : ${lastError}`);
    }
  }

  log.error(`[fitness-sync] Abandon après ${ATTEMPTS} tentatives : ${lastError}`);
  await journaliserEchec(profileId, `Envoi vers l'app fitness impossible : ${lastError}`, log);
  return "echec";
}

/** Marque une pesée comme parvenue à l'app fitness (elle ne sera plus rejouée). */
async function markSynced(measurementId: string, log: Logger): Promise<void> {
  try {
    const [{ db }, { measurements }, { eq }] = await Promise.all([
      import("../../config/db.js"),
      import("../../db/schema.js"),
      import("drizzle-orm"),
    ]);
    await db.update(measurements).set({ fitnessSyncedAt: new Date() }).where(eq(measurements.id, measurementId));
  } catch (err) {
    // Pire cas : la pesée sera renvoyée une fois de trop. L'ingestion est idempotente
    // (l'identifiant de synchro dérive de l'id de la pesée), donc c'est sans conséquence.
    log.warn(`[fitness-sync] Marquage impossible pour ${measurementId} : ${(err as Error).message}`);
  }
}

// Une seule passe de rattrapage à la fois : le démarrage du serveur et une pesée peuvent la
// déclencher en même temps, et deux passes concurrentes enverraient tout en double.
let catchupRunning = false;

/**
 * Rejoue les pesées qui ne sont jamais parvenues à l'app fitness.
 *
 * C'est ce qui rend l'envoi RÉELLEMENT automatique : sans rattrapage, une pesée émise pendant
 * une indisponibilité était perdue pour toujours, en silence. Le cas courant n'est pas la
 * panne mais le réveil à froid de l'hébergement.
 *
 * Déclenché (a) après une pesée envoyée avec succès — le service répond, c'est le bon moment,
 * et (b) au démarrage du serveur, pour rattraper ce qui s'est accumulé pendant une coupure.
 * S'arrête au premier échec : si l'app fitness est encore à terre, insister ne sert à rien.
 */
export async function flushPendingWeighIns(log: Logger): Promise<number> {
  if (!fitnessSyncConfigured() || catchupRunning) return 0;
  catchupRunning = true;
  try {
    const [{ db }, { measurements, profiles, users }, { and, asc, eq, gt, inArray, isNull, sql }] = await Promise.all([
      import("../../config/db.js"),
      import("../../db/schema.js"),
      import("drizzle-orm"),
    ]);

    const emails = fitnessSyncEmails();
    const since = new Date(Date.now() - CATCHUP_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        id: measurements.id,
        profileId: measurements.profileId,
        userId: profiles.userId,
        createdAt: measurements.createdAt,
        weightKg: measurements.weightKg,
        fatPct: measurements.fatPct,
        musclePct: measurements.musclePct,
        waterPct: measurements.waterPct,
        boneMassKg: measurements.boneMassKg,
        bmr: measurements.bmr,
        visceralFat: measurements.visceralFat,
        email: users.email,
      })
      .from(measurements)
      .innerJoin(profiles, eq(measurements.profileId, profiles.id))
      .innerJoin(users, eq(profiles.userId, users.id))
      // Le filtre sur la liste blanche est fait EN SQL : sinon les pesées des comptes non
      // concernés — éternellement « non envoyées », par définition — rempliraient la limite
      // et affameraient celles qui attendent vraiment.
      .where(
        and(
          isNull(measurements.fitnessSyncedAt),
          eq(measurements.fitnessSyncSkipped, false), // hors périmètre : jamais rejouées
          gt(measurements.createdAt, since),
          inArray(sql`lower(${users.email})`, emails)
        )
      )
      .orderBy(asc(measurements.createdAt))
      .limit(CATCHUP_LIMIT);

    // Second filet : la liste blanche a pu changer entre la requête et l'envoi.
    const pending = rows.filter((r: { email: string }) => shouldSync(r.email));
    if (pending.length === 0) return 0;

    log.info(`[fitness-sync] Rattrapage : ${pending.length} pesée(s) à renvoyer.`);
    let sent = 0;
    for (const r of pending) {
      const num = (v: string | null) => (v === null ? null : Number(v));
      const issue = await sendBestEffort(
        {
          email: fitnessSyncTargetEmail(r.email),
          deleted: false,
          measurementId: r.id,
          measuredAt: new Date(r.createdAt).toISOString(),
          weightKg: Number(r.weightKg),
          composition: {
            fatPct: num(r.fatPct),
            musclePct: num(r.musclePct),
            waterPct: num(r.waterPct),
            boneMassKg: num(r.boneMassKg),
            bmr: r.bmr,
            visceralFat: r.visceralFat,
          },
        },
        r.profileId,
        log
      );
      // On s'arrête au premier problème, quel qu'il soit : service encore à terre, ou cible
      // mal configurée. Dans les deux cas, enchaîner les 49 suivantes ne ferait qu'empiler
      // des échecs identiques dans le journal.
      if (issue !== "ok") break;
      await markSynced(r.id, log);
      broadcastToUser(r.userId, "measurement_synced", { id: r.id });
      sent++;
    }
    if (sent) log.info(`[fitness-sync] Rattrapage terminé : ${sent}/${pending.length} envoyée(s).`);
    return sent;
  } catch (err) {
    log.error(`[fitness-sync] Rattrapage impossible : ${(err as Error).message}`);
    return 0;
  } finally {
    catchupRunning = false;
  }
}

/** Pousse une pesée. À appeler sans `await` (effet de bord après réponse). */
export function syncWeighIn(
  email: string,
  userId: string,
  profileId: string,
  payload: WeighInPayload,
  log: Logger
): void {
  if (!shouldSync(email)) return;
  void (async () => {
    const issue = await sendBestEffort(
      { email: fitnessSyncTargetEmail(email), deleted: false, ...payload },
      profileId,
      log
    );
    // Pas « ok » : on ne marque PAS la pesée comme envoyée, elle repassera au rattrapage.
    // Cas « compte-introuvable » compris : la configuration corrigée, elle remontera d'elle-même.
    if (issue !== "ok") return;
    await markSynced(payload.measurementId, log);
    // L'envoi se fait APRÈS la réponse HTTP : sans cet événement, l'app resterait sur un
    // « pas encore envoyé » jusqu'au prochain rechargement.
    broadcastToUser(userId, "measurement_synced", { id: payload.measurementId });
    // L'app fitness répond : c'est le meilleur moment pour vider l'éventuel retard accumulé.
    await flushPendingWeighIns(log);
  })();
}

/** Pousse la suppression d'une pesée (l'entrée disparaît aussi côté fitness). */
export function syncDeletion(email: string, profileId: string, measurementId: string, log: Logger): void {
  if (!shouldSync(email)) return;
  void sendBestEffort({ email: fitnessSyncTargetEmail(email), deleted: true, measurementId }, profileId, log);
}
