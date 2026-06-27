import { FastifyInstance } from "fastify";
import {
  getMyHouseholdHandler,
  createHouseholdHandler,
  joinHouseholdHandler,
  leaveHouseholdHandler,
  regenerateCodeHandler,
  renameHouseholdHandler,
  removeMemberHandler,
} from "./householdsController.js";

export async function householdsRoutes(fastify: FastifyInstance) {
  // Hook de sécurité : token JWT obligatoire sur toutes les routes.
  fastify.addHook("preHandler", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: "Unauthorized", message: "Token invalide ou manquant" });
    }
  });

  fastify.get("/me", getMyHouseholdHandler);
  fastify.post("/", createHouseholdHandler);
  fastify.put("/", renameHouseholdHandler);
  fastify.post("/join", joinHouseholdHandler);
  fastify.post("/leave", leaveHouseholdHandler);
  fastify.post("/regenerate-code", regenerateCodeHandler);
  fastify.delete("/members/:userId", removeMemberHandler);
}
