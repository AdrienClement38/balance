import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../../config/db.js";
import { profiles } from "../../db/schema.js";
import { and, eq } from "drizzle-orm";

// Schema validations
export const createProfileSchema = z.object({
  name: z.string().min(1, "Le nom est requis").max(100, "Le nom est trop long"),
  gender: z.enum(["male", "female"], {
    errorMap: () => ({ message: "Le genre doit être 'male' ou 'female'" }),
  }),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date requis : AAAA-MM-JJ"),
  heightCm: z.number().int().min(50, "Taille minimale : 50cm").max(250, "Taille maximale : 250cm"),
});

export const updateProfileSchema = createProfileSchema.partial();

export type CreateProfileInput = z.infer<typeof createProfileSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export async function getProfilesHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as { id: string }).id;

    const userProfiles = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, userId));

    return reply.status(200).send(userProfiles);
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Une erreur est survenue lors de la récupération des profils.",
    });
  }
}

export async function createProfileHandler(
  request: FastifyRequest<{ Body: CreateProfileInput }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as { id: string }).id;
    const data = createProfileSchema.parse(request.body);

    const [newProfile] = await db
      .insert(profiles)
      .values({
        userId,
        name: data.name,
        gender: data.gender,
        birthdate: data.birthdate,
        heightCm: data.heightCm,
      })
      .returning();

    return reply.status(201).send(newProfile);
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
      message: "Une erreur est survenue lors de la création du profil.",
    });
  }
}

export async function updateProfileHandler(
  request: FastifyRequest<{ Params: { id: string }; Body: UpdateProfileInput }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as { id: string }).id;
    const profileId = request.params.id;
    const data = updateProfileSchema.parse(request.body);

    // Vérifier d'abord si le profil appartient bien à l'utilisateur authentifié
    const [existingProfile] = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
      .limit(1);

    if (!existingProfile) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Profil introuvable ou vous n'avez pas l'autorisation d'y accéder.",
      });
    }

    // Effectuer la mise à jour
    const [updatedProfile] = await db
      .update(profiles)
      .set({
        ...data,
      })
      .where(eq(profiles.id, profileId))
      .returning();

    return reply.status(200).send(updatedProfile);
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
      message: "Une erreur est survenue lors de la mise à jour du profil.",
    });
  }
}

export async function deleteProfileHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as { id: string }).id;
    const profileId = request.params.id;

    // Vérifier si le profil appartient à l'utilisateur
    const [existingProfile] = await db
      .select()
      .from(profiles)
      .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
      .limit(1);

    if (!existingProfile) {
      return reply.status(404).send({
        error: "Not Found",
        message: "Profil introuvable ou vous n'avez pas l'autorisation d'y accéder.",
      });
    }

    // Supprimer le profil (les mesures seront supprimées en cascade par PostgreSQL)
    await db
      .delete(profiles)
      .where(eq(profiles.id, profileId));

    return reply.status(204).send(); // Pas de contenu
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({
      error: "Internal Server Error",
      message: "Une erreur est survenue lors de la suppression du profil.",
    });
  }
}
