import { FastifyInstance } from "fastify";
import { createErrorHandler, getErrorsHandler } from "./errorsController.js";

export async function errorsRoutes(fastify: FastifyInstance) {
  // Hook de sécurité : token JWT obligatoire sur toutes les routes.
  fastify.addHook("preHandler", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: "Unauthorized", message: "Token invalide ou manquant" });
    }
  });

  fastify.post("/", createErrorHandler);
  fastify.get("/", getErrorsHandler);
}
