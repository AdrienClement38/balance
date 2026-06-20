import { FastifyInstance } from "fastify";
import {
  createProfileHandler,
  deleteProfileHandler,
  getProfilesHandler,
  updateProfileHandler,
} from "./profilesController.js";

export async function profilesRoutes(fastify: FastifyInstance) {
  // Hook de sécurité preHandler : tous les appels doivent avoir un JWT valide
  fastify.addHook("preHandler", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: "Unauthorized", message: "Token invalide ou manquant" });
    }
  });

  fastify.get("/", getProfilesHandler);
  fastify.post("/", createProfileHandler);
  fastify.put("/:id", updateProfileHandler);
  fastify.delete("/:id", deleteProfileHandler);
}
