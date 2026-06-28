import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../config/db.js";
import { measurements, profiles } from "../../db/schema.js";
import { and, desc, eq } from "drizzle-orm";
import { calculateBia } from "../bia/biaCalculator.js";
import { broadcastToUser } from "../../config/websocket.js";

// Input validation
export const createMeasurementSchema = z.object({
  profileId: z.string().uuid("ID de profil invalide"),
  weightKg: z.number().min(5, "Poids minimal : 5kg").max(300, "Poids maximal : 300kg"),
  // Hors plage plausible (ex. sentinelle 0xFE00 = 65024 « pas encore mesurée ») -> 0
  // (non mesurée). On ne REJETTE JAMAIS une pesée valide à cause d'une impédance aberrante :
  // le calcul BIA bascule alors proprement sur une estimation sans impédance.
  impedanceOhms: z
    .number()
    .int()
    .catch(0)
    .transform((v) => (v > 0 && v <= 2000 ? v : 0)),
});

export type CreateMeasurementInput = z.infer<typeof createMeasurementSchema>;

export async function createMeasurementHandler(
  request: FastifyRequest<{ Body: CreateMeasurementInput }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as { id: string }).id;
    const { profileId, weightKg, impedanceOhms } = createMeasurementSchema.parse(request.body);

    // 1. Vérifier la possession du profil par l'utilisateur et récupérer ses détails
    const [profile] = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
      .limit(1);

    if (!profile) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Profil introuvable ou accès non autorisé.",
      });
    }

    // 2. Calculer l'âge au moment de la pesée
    const ageYears = calculateAge(profile.birthdate);

    // 3. Lancer les calculs de BIA via le bia-processor
    const bia = calculateBia({
      weightKg,
      impedanceOhms,
      ageYears,
      gender: profile.gender as "male" | "female",
      heightCm: profile.heightCm,
    });

    // 4. Enregistrer la mesure dans la base de données
    const [newMeasurement] = await db
      .insert(measurements)
      .values({
        profileId,
        weightKg: weightKg.toString(),
        impedanceOhms,
        fatPct: bia.fatPct.toString(),
        musclePct: bia.musclePct.toString(),
        waterPct: bia.waterPct.toString(),
        boneMassKg: bia.boneMassKg.toString(),
        bmr: bia.bmr,
        visceralFat: bia.visceralFat,
      })
      .returning();

    // 5. Diffuser instantanément la pesée à tous les onglets/clients connectés de cet utilisateur
    broadcastToUser(userId, "new_measurement", newMeasurement);

    return reply.status(201).send(newMeasurement);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({
        error: "Bad Request",
        message: "Données de validation incorrectes",
        details: error.flatten().fieldErrors,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Une erreur est survenue lors de l'enregistrement de la mesure.",
    });
  }
}

export async function deleteMeasurementHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as { id: string }).id;
    const measurementId = request.params.id;

    // Propriété : la mesure doit appartenir à un profil de l'utilisateur courant.
    const [row] = await db
      .select({ id: measurements.id })
      .from(measurements)
      .innerJoin(profiles, eq(measurements.profileId, profiles.id))
      .where(and(eq(measurements.id, measurementId), eq(profiles.userId, userId)))
      .limit(1);

    if (!row) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Mesure introuvable ou accès non autorisé.",
      });
    }

    await db.delete(measurements).where(eq(measurements.id, measurementId));
    return reply.status(200).send({ deleted: true });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Une erreur est survenue lors de la suppression de la mesure.",
    });
  }
}

export async function getMeasurementsHandler(
  request: FastifyRequest<{ Params: { profileId: string }; Querystring: { limit?: string } }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as { id: string }).id;
    const profileId = request.params.profileId;
    const limit = parseInt(request.query.limit || "50", 10);

    // 1. Vérifier si le profil appartient à l'utilisateur
    const [profile] = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
      .limit(1);

    if (!profile) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Profil introuvable ou accès non autorisé.",
      });
    }

    // 2. Récupérer l'historique trié par date décroissante
    const history = await db
      .select()
      .from(measurements)
      .where(eq(measurements.profileId, profileId))
      .orderBy(desc(measurements.createdAt))
      .limit(limit);

    return reply.status(200).send(history);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Une erreur est survenue lors de la récupération de l'historique.",
    });
  }
}

function calculateAge(birthdateStr: string): number {
  const birthdate = new Date(birthdateStr);
  const today = new Date();
  let age = today.getFullYear() - birthdate.getFullYear();
  const monthDiff = today.getMonth() - birthdate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthdate.getDate())) {
    age--;
  }
  return age;
}
