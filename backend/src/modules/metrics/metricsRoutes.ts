import { FastifyInstance } from "fastify";
import {
  createMeasurementHandler,
  getMeasurementsHandler,
  deleteMeasurementHandler,
} from "./metricsController.js";

export async function metricsRoutes(fastify: FastifyInstance) {
  // Hook de sécurité preHandler : vérification obligatoire du token JWT
  fastify.addHook("preHandler", async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send({ error: "Unauthorized", message: "Token invalide ou manquant" });
    }
  });

  fastify.post("/", createMeasurementHandler);
  fastify.get("/:profileId", getMeasurementsHandler);
  fastify.delete("/:id", deleteMeasurementHandler);
}
