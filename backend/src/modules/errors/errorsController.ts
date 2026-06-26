import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../config/db.js";
import { errorLogs, profiles } from "../../db/schema.js";
import { and, desc, eq } from "drizzle-orm";

export const createErrorSchema = z.object({
  profileId: z.string().uuid("ID de profil invalide"),
  code: z.string().min(1).max(50),
  message: z.string().min(1).max(500),
  weightKg: z.number().min(0).max(500).optional(),
  impedanceOhms: z.number().int().min(0).max(100000).optional(),
});

export type CreateErrorInput = z.infer<typeof createErrorSchema>;

export async function createErrorHandler(
  request: FastifyRequest<{ Body: CreateErrorInput }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as { id: string }).id;
    const { profileId, code, message, weightKg, impedanceOhms } = createErrorSchema.parse(request.body);

    // Vérifier la propriété du profil par l'utilisateur authentifié.
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

    const [log] = await db
      .insert(errorLogs)
      .values({
        profileId,
        code,
        message,
        weightKg: weightKg !== undefined ? weightKg.toString() : null,
        impedanceOhms: impedanceOhms ?? null,
      })
      .returning();

    return reply.status(201).send(log);
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
      message: "Une erreur est survenue lors de l'enregistrement du journal d'erreur.",
    });
  }
}

export async function getErrorsHandler(
  request: FastifyRequest<{ Querystring: { limit?: string } }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as { id: string }).id;
    const limit = parseInt(request.query.limit || "50", 10);

    // Erreurs de tous les profils de l'utilisateur (scope via profiles.userId).
    const rows = await db
      .select({
        id: errorLogs.id,
        profileId: errorLogs.profileId,
        profileName: profiles.name,
        code: errorLogs.code,
        message: errorLogs.message,
        weightKg: errorLogs.weightKg,
        impedanceOhms: errorLogs.impedanceOhms,
        createdAt: errorLogs.createdAt,
      })
      .from(errorLogs)
      .innerJoin(profiles, eq(errorLogs.profileId, profiles.id))
      .where(eq(profiles.userId, userId))
      .orderBy(desc(errorLogs.createdAt))
      .limit(limit);

    return reply.status(200).send(rows);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Une erreur est survenue lors de la récupération des journaux d'erreur.",
    });
  }
}
