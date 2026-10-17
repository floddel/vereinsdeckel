// Build bei Vercel: zuerst die Datenbank-Updates (Migrationen) einspielen, dann die App bauen.
// Nur für die echte Seite (Production) – Vorschau-Versionen fassen die Datenbank nicht an.
// Beim Start der App werden die Migrationen bei Vercel dann übersprungen (src/db/prepare.ts).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const MIGRATION_LOCK = 724_031; // dieselbe Sperre wie in src/db/setup.ts

async function migrateProduction() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL fehlt (bei Vercel unter Settings → Environment Variables eintragen)");
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const conn = await pool.connect();
  try {
    await conn.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
    try {
      await migrate(drizzle({ client: conn, casing: "snake_case" }), { migrationsFolder: path.join(process.cwd(), "src/db/migrations") });
    } finally {
      await conn.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]);
    }
  } finally {
    conn.release();
    await pool.end();
  }
  console.log("Datenbank-Updates eingespielt.");
}

if (process.env.VERCEL_ENV === "production") await migrateProduction();
else console.log(`Keine Datenbank-Updates (VERCEL_ENV=${process.env.VERCEL_ENV ?? "–"}).`);

if (process.env.SKIP_NEXT_BUILD !== "1") {
  const build = spawnSync("npx", ["next", "build"], { stdio: "inherit" });
  process.exit(build.status ?? 1);
}
