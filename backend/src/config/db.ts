import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../db/schema.js";
import * as dotenv from "dotenv";

dotenv.config();

const connectionString = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/balance";

// Configure Connection Pool
export const pool = new pg.Pool({
  connectionString,
  // Limitation de AlwaysData formule gratuite (max 100MB RAM, max 3 connexions PostgreSQL gratuites)
  max: process.env.NODE_ENV === "production" ? 3 : 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export const db = drizzle(pool, { schema });
export default db;
