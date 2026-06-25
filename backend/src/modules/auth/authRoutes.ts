import { FastifyInstance } from "fastify";
import { loginHandler, registerHandler } from "./authController.js";

export async function authRoutes(fastify: FastifyInstance) {
  // Limites strictes sur l'authentification pour ralentir les attaques par force brute
  fastify.post(
    "/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    registerHandler
  );
  fastify.post(
    "/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    loginHandler
  );
}
