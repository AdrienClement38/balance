import fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import * as dotenv from "dotenv";

import { authRoutes } from "./modules/auth/authRoutes.js";
import { profilesRoutes } from "./modules/profiles/profilesRoutes.js";
import { metricsRoutes } from "./modules/metrics/metricsRoutes.js";
import { pool, runMigrations } from "./config/db.js";
import { registerWebSocket } from "./config/websocket.js";

dotenv.config();

const server = fastify({
  logger: {
    level: process.env.NODE_ENV === "production" ? "info" : "debug",
  },
});

// 1. Configuration CORS
server.register(cors, {
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// 2. Configuration JWT
const jwtSecret = process.env.JWT_SECRET || "balance-super-secret-key-development";
server.register(jwt, {
  secret: jwtSecret,
});

// Enregistrement de la gestion des WebSockets
registerWebSocket(server);

// 3. Enregistrement des routes de l'API (Modular Monolith)
server.register(authRoutes, { prefix: "/api/auth" });
server.register(profilesRoutes, { prefix: "/api/profiles" });
server.register(metricsRoutes, { prefix: "/api/metrics" });

server.get("/", async (request, reply) => {
  return { status: "healthy", service: "balance-backend", timestamp: new Date() };
});

// 4. Gestion de la déconnexion propre (Graceful Shutdown)
const shutdown = async () => {
  server.log.info("Arrêt progressif du serveur...");
  try {
    await server.close();
    if (pool) {
      await pool.end();
    }
    server.log.info("Serveur et connexions base de données fermés proprement.");
    process.exit(0);
  } catch (err) {
    server.log.error(err, "Erreur durant l'arrêt du serveur");
    process.exit(1);
  }
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// 5. Lancement du serveur
const start = async () => {
  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "0.0.0.0";
  
  try {
    await runMigrations();
    await server.listen({ port, host });
    server.log.info(`Serveur en écoute sur http://${host}:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
