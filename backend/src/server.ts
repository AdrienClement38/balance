import fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import { authRoutes } from "./modules/auth/authRoutes.js";
import { profilesRoutes } from "./modules/profiles/profilesRoutes.js";
import { metricsRoutes } from "./modules/metrics/metricsRoutes.js";
import { pool, runMigrations } from "./config/db.js";
import { registerWebSocket } from "./config/websocket.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// 2b. Limitation du débit global (protection anti-abus et anti-brute-force).
// Marge suffisante car le backend sert aussi les fichiers statiques du frontend.
server.register(rateLimit, {
  max: 300,
  timeWindow: "1 minute",
});

// Enregistrement de la gestion des WebSockets
registerWebSocket(server);

// 3. Enregistrement des routes de l'API (Modular Monolith)
server.register(authRoutes, { prefix: "/api/auth" });
server.register(profilesRoutes, { prefix: "/api/profiles" });
server.register(metricsRoutes, { prefix: "/api/metrics" });

// Endpoint de santé (sur /healthz pour laisser "/" au frontend).
server.get("/healthz", async () => {
  return { status: "healthy", service: "balance-backend", timestamp: new Date() };
});

// 3b. Mode « 1 seul site » : si le frontend a été buildé, le backend le sert lui-même.
// API + WebSocket + frontend sur le même domaine => pas de CORS, et un seul HTTPS
// (indispensable au Web Bluetooth). En l'absence de build, on reste en mode API seule.
const frontendDist = process.env.FRONTEND_DIST
  ? path.resolve(process.env.FRONTEND_DIST)
  : path.join(__dirname, "../../frontend/dist");

if (fs.existsSync(path.join(frontendDist, "index.html"))) {
  server.register(fastifyStatic, { root: frontendDist });
  // Repli SPA : toute route GET inconnue (hors /api et /ws) renvoie index.html.
  server.setNotFoundHandler((request, reply) => {
    const url = request.raw.url || "";
    if (request.method !== "GET" || url.startsWith("/api") || url.startsWith("/ws")) {
      reply.status(404).send({ error: "Not Found", message: "Ressource introuvable." });
      return;
    }
    reply.sendFile("index.html");
  });
  server.log.info(`Frontend servi depuis ${frontendDist} (mode 1 seul site).`);
} else {
  server.get("/", async () => {
    return { status: "healthy", service: "balance-backend", frontend: "non buildé (mode API seule)" };
  });
}

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
