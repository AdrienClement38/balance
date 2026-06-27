import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../../config/db.js";
import { households, householdMembers, users } from "../../db/schema.js";

// --- Validation ---
const createSchema = z.object({
  name: z.string().trim().min(1, "Le nom de la maison est requis").max(100),
});
const joinSchema = z.object({
  code: z.string().trim().min(4, "Code d'invitation invalide").max(16),
});
const renameSchema = createSchema;

// Alphabet sans caractères ambigus (pas de I, O, 0, 1, L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function randomCode(len = 8): string {
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}
async function uniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = randomCode();
    const [existing] = await db
      .select({ id: households.id })
      .from(households)
      .where(eq(households.inviteCode, code))
      .limit(1);
    if (!existing) return code;
  }
  return randomCode(10); // repli quasi sûr
}

/** Renvoie l'appartenance (maison) du user courant, ou null. */
async function getMembership(userId: string) {
  const [m] = await db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .limit(1);
  return m ?? null;
}

/** GET /api/households/me — maison du user + liste des membres (sans leurs données). */
export async function getMyHouseholdHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as { id: string }).id;
    const membership = await getMembership(userId);
    if (!membership) return reply.send({ household: null, members: [] });

    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.id, membership.householdId))
      .limit(1);
    if (!household) return reply.send({ household: null, members: [] });

    const members = await db
      .select({
        userId: householdMembers.userId,
        role: householdMembers.role,
        email: users.email,
        joinedAt: householdMembers.joinedAt,
      })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, household.id))
      .orderBy(householdMembers.joinedAt);

    return reply.send({
      household: {
        id: household.id,
        name: household.name,
        inviteCode: household.inviteCode,
        ownerId: household.ownerId,
        isOwner: household.ownerId === userId,
        createdAt: household.createdAt,
      },
      members: members.map((m: (typeof members)[number]) => ({
        ...m,
        isMe: m.userId === userId,
        isOwner: m.userId === household.ownerId,
      })),
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: "Internal Server Error", message: "Erreur lors du chargement de la maison." });
  }
}

/** POST /api/households — créer une maison (le créateur en devient propriétaire). */
export async function createHouseholdHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as { id: string }).id;
    const { name } = createSchema.parse(request.body);

    if (await getMembership(userId)) {
      return reply.status(409).send({
        error: "Conflict",
        message: "Vous faites déjà partie d'une maison. Quittez-la avant d'en créer une autre.",
      });
    }

    const inviteCode = await uniqueInviteCode();
    const [household] = await db.insert(households).values({ name, ownerId: userId, inviteCode }).returning();
    await db.insert(householdMembers).values({ householdId: household.id, userId, role: "owner" });

    return reply.status(201).send(household);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: "Bad Request", message: "Nom de maison invalide", details: error.flatten().fieldErrors });
    }
    request.log.error(error);
    return reply.status(500).send({ error: "Internal Server Error", message: "Erreur lors de la création de la maison." });
  }
}

/** POST /api/households/join — rejoindre une maison via son code d'invitation. */
export async function joinHouseholdHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as { id: string }).id;
    const { code } = joinSchema.parse(request.body);

    if (await getMembership(userId)) {
      return reply.status(409).send({
        error: "Conflict",
        message: "Vous faites déjà partie d'une maison. Quittez-la avant d'en rejoindre une autre.",
      });
    }

    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.inviteCode, code.toUpperCase()))
      .limit(1);
    if (!household) {
      return reply.status(404).send({ error: "Not Found", message: "Code d'invitation invalide ou expiré." });
    }

    await db.insert(householdMembers).values({ householdId: household.id, userId, role: "member" });
    return reply.status(200).send(household);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: "Bad Request", message: "Code invalide", details: error.flatten().fieldErrors });
    }
    request.log.error(error);
    return reply.status(500).send({ error: "Internal Server Error", message: "Erreur lors de l'adhésion à la maison." });
  }
}

/** POST /api/households/leave — quitter ; si propriétaire, la maison est dissoute. */
export async function leaveHouseholdHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as { id: string }).id;
    const membership = await getMembership(userId);
    if (!membership) return reply.status(404).send({ error: "Not Found", message: "Vous n'êtes dans aucune maison." });

    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.id, membership.householdId))
      .limit(1);

    if (household && household.ownerId === userId) {
      // Le propriétaire dissout la maison (cascade -> retire tous les membres).
      await db.delete(households).where(eq(households.id, household.id));
      return reply.send({ disbanded: true });
    }

    await db
      .delete(householdMembers)
      .where(and(eq(householdMembers.userId, userId), eq(householdMembers.householdId, membership.householdId)));
    return reply.send({ left: true });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: "Internal Server Error", message: "Erreur lors de la sortie de la maison." });
  }
}

/** POST /api/households/regenerate-code — propriétaire : nouveau code d'invitation. */
export async function regenerateCodeHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as { id: string }).id;
    const membership = await getMembership(userId);
    if (!membership) return reply.status(404).send({ error: "Not Found", message: "Vous n'êtes dans aucune maison." });

    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.id, membership.householdId))
      .limit(1);
    if (!household || household.ownerId !== userId) {
      return reply.status(403).send({ error: "Forbidden", message: "Seul le propriétaire peut changer le code." });
    }

    const inviteCode = await uniqueInviteCode();
    await db.update(households).set({ inviteCode }).where(eq(households.id, household.id));
    return reply.send({ inviteCode });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: "Internal Server Error", message: "Erreur lors du renouvellement du code." });
  }
}

/** PUT /api/households — propriétaire : renommer la maison. */
export async function renameHouseholdHandler(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request.user as { id: string }).id;
    const { name } = renameSchema.parse(request.body);
    const membership = await getMembership(userId);
    if (!membership) return reply.status(404).send({ error: "Not Found", message: "Vous n'êtes dans aucune maison." });

    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.id, membership.householdId))
      .limit(1);
    if (!household || household.ownerId !== userId) {
      return reply.status(403).send({ error: "Forbidden", message: "Seul le propriétaire peut renommer la maison." });
    }

    const [updated] = await db.update(households).set({ name }).where(eq(households.id, household.id)).returning();
    return reply.send(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return reply.status(400).send({ error: "Bad Request", message: "Nom invalide", details: error.flatten().fieldErrors });
    }
    request.log.error(error);
    return reply.status(500).send({ error: "Internal Server Error", message: "Erreur lors du renommage." });
  }
}

/** DELETE /api/households/members/:userId — propriétaire : retirer un membre. */
export async function removeMemberHandler(
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply
) {
  try {
    const userId = (request.user as { id: string }).id;
    const targetId = request.params.userId;
    const membership = await getMembership(userId);
    if (!membership) return reply.status(404).send({ error: "Not Found", message: "Vous n'êtes dans aucune maison." });

    const [household] = await db
      .select()
      .from(households)
      .where(eq(households.id, membership.householdId))
      .limit(1);
    if (!household || household.ownerId !== userId) {
      return reply.status(403).send({ error: "Forbidden", message: "Seul le propriétaire peut retirer un membre." });
    }
    if (targetId === userId) {
      return reply.status(400).send({ error: "Bad Request", message: "Pour partir vous-même, utilisez « Quitter la maison »." });
    }

    await db
      .delete(householdMembers)
      .where(and(eq(householdMembers.householdId, household.id), eq(householdMembers.userId, targetId)));
    return reply.send({ removed: true });
  } catch (error) {
    request.log.error(error);
    return reply.status(500).send({ error: "Internal Server Error", message: "Erreur lors du retrait du membre." });
  }
}
