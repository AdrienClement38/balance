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
    // 30 s était trop court : le pool se vidait entre deux visites, et la requête suivante
    // repayait une ouverture de connexion complète (DNS + TLS + authentification) — la
    // fameuse « première page très lente ». 5 min gardent le lien chaud sans monopoliser
    // le quota de connexions de l'hébergement.
    idleTimeoutMillis: 5 * 60 * 1000,
    // 2 s ne suffisent pas à ouvrir une connexion TLS vers un Postgres distant réveillé
    // à froid : la première requête après une inactivité partait en 500 alors que la base
    // allait parfaitement bien.
    connectionTimeoutMillis: 10000,
  });

  // ⚠️ Sans cet écouteur, une connexion INACTIVE coupée par le serveur (redémarrage
  // Postgres, coupure réseau, expiration côté hébergeur) émet une erreur qui n'appartient
  // à aucune requête. Node traite alors un 'error' sans écouteur comme une exception non
  // interceptée et TUE le process : le site tombe sans que personne n'ait rien fait.
  pool.on("error", (err) => {
    console.error("[db] Connexion inactive perdue (le pool en rouvrira une) :", err.message);
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
