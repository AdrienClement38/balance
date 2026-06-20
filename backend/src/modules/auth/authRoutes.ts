import { FastifyInstance } from "fastify";
import { loginHandler, registerHandler } from "./authController.js";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/register", registerHandler);
  fastify.post("/login", loginHandler);
}
