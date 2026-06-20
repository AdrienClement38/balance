import { drizzle as pgDrizzle } from "drizzle-orm/node-postgres";
import { drizzle as pgliteDrizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import * as schema from "../db/schema.js";
import * as dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { migrate as pgMigrate } from "drizzle-orm/node-postgres/migrator";
import { migrate as pgliteMigrate } from "drizzle-orm/pglite/migrator";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// On utilise Postgres uniquement en production (NODE_ENV=production)
// En local (development), on utilise PGlite (PostgreSQL WASM embarqué)
const useProductionDb = process.env.NODE_ENV === "production";

export let db: any;
export let pool: pg.Pool | null = null;
export let pgliteClient: PGlite | null = null;

if (useProductionDb) {
  const connectionString = process.env.DATABASE_URL;
  pool = new pg.Pool({
    connectionString,
    max: 3, // Limitation AlwaysData
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
  db = pgDrizzle(pool, { schema });
} else {
  // En local, on utilise PGlite persistant dans le dossier ./db_data à la racine du projet
  const dbPath = path.join(__dirname, "../../../db_data");
  pgliteClient = new PGlite(dbPath);
  db = pgliteDrizzle(pgliteClient, { schema });
}

/**
 * Applique automatiquement les migrations au démarrage du serveur.
 */
export async function runMigrations() {
  const migrationsFolder = path.join(__dirname, "../db/migrations");
  
  try {
    if (useProductionDb) {
      console.log("Application des migrations PostgreSQL (Production AlwaysData)...");
      await pgMigrate(db, { migrationsFolder });
    } else {
      console.log("Application des migrations locales PGlite (PostgreSQL WASM)...");
      await pgliteMigrate(db, { migrationsFolder });
    }
    console.log("Migrations appliquées avec succès !");
  } catch (error) {
    console.error("Erreur lors de l'application des migrations :", error);
    throw error;
  }
}

export default db;
