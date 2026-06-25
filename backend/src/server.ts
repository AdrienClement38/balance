import fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import * as dotenv from "dotenv";

import { authRoutes } from "./modules/auth/authRoutes.js";
import { profilesRoutes } from "./modules/profiles/profilesRoutes.js";
import { metricsRoutes } from "./modules/metrics/metricsRoutes.js";
import { pool, runMigrations } from "./config/db.js";
import { registerWebSocket } from "./config/websocket.js";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";

const server = fastify({
  logger: {
    level: isProduction ? "info" : "debug",
  },
});

// 1. Configuration CORS
if (isProduction && !process.env.CORS_ORIGIN) {
  server.log.warn(
    "CORS_ORIGIN n'est pas défini en production : l'API accepte actuellement toutes les origines (*). Définissez CORS_ORIGIN pour restreindre l'accès."
  );
}
server.register(cors, {
  origin: process.env.CORS_ORIGIN || "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// 2. Configuration JWT
const jwtSecret = process.env.JWT_SECRET || "balance-super-secret-key-development";
if (isProduction && !process.env.JWT_SECRET) {
  throw new Error(
    "Configuration invalide : la variable d'environnement JWT_SECRET est obligatoire en production."
  );
}
server.register(jwt, {
  secret: jwtSecret,
});

// 2b. Limitation du débit global (protection anti-abus et anti-brute-force)
server.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
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
  // AlwaysData impose d'écouter sur ALWAYSDATA_HTTPD_IP / ALWAYSDATA_HTTPD_PORT.
  // On les prend en priorité après PORT/HOST explicites, sinon défaut local 3006.
  const port = parseInt(process.env.PORT || process.env.ALWAYSDATA_HTTPD_PORT || "3006", 10);
  const host = process.env.HOST || process.env.ALWAYSDATA_HTTPD_IP || "0.0.0.0";
  
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
