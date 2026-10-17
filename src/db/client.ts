import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

/**
 * Datenbank-Verbindung – zwei Wege, gleiche App:
 * - DATABASE_URL gesetzt → jedes PostgreSQL (z. B. Neon, Supabase, eigener Server).
 * - sonst die eingebaute Datenbank (PGlite, echtes PostgreSQL ohne Zusatzsoftware), Daten in einem Ordner:
 *   PGLITE_DIR, sonst DATA_DIR/db, sonst .data/dev (Entwicklung).
 * Ohne Ordner (nur Tests): im Arbeitsspeicher.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createPgliteDb(dataDir?: string): Db {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const client = new PGlite(dataDir);
  return drizzlePglite({ client, schema, casing: "snake_case" });
}

export function createPostgresDb(connectionString: string): Db {
  const pool = new Pool({
    connectionString,
    // Klein halten: Bei Vercel läuft jede Funktion mit eigenem Pool (Neon: die „-pooler“-Adresse nehmen).
    max: Number(process.env.DATABASE_POOL_MAX) || 5,
  });
  return drizzleNodePg({ client: pool, schema, casing: "snake_case" });
}

/** Ordner der eingebauten Datenbank (nur ohne DATABASE_URL). */
export function pgliteDir(env: Record<string, string | undefined> = process.env): string {
  if (env.PGLITE_DIR) return env.PGLITE_DIR;
  if (env.DATA_DIR) return path.join(env.DATA_DIR, "db");
  return ".data/dev";
}

export type DbKind = "postgres" | "pglite";

export function dbKind(env: Record<string, string | undefined> = process.env): DbKind {
  return env.DATABASE_URL ? "postgres" : "pglite";
}

// Eine Verbindung pro Server-Prozess (auch über Hot-Reloads in der Entwicklung hinweg).
const globalForDb = globalThis as unknown as { __vereinsdeckelDb?: Db };

export function getDb(): Db {
  globalForDb.__vereinsdeckelDb ??= process.env.DATABASE_URL ? createPostgresDb(process.env.DATABASE_URL) : createPgliteDb(pgliteDir());
  return globalForDb.__vereinsdeckelDb;
}
