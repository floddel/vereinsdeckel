import { generateMemberToken } from "@/lib/token";
import { getDb } from "./client";
import { migrateDb, seedBaseData, seedExampleArticles, seedExampleMembers } from "./setup";

/** Beim Serverstart: Schema aktualisieren und Grunddaten sicherstellen. */
export async function prepareDatabase(): Promise<void> {
  const db = getDb();
  // Bei Vercel spielt der Build die Migrationen ein (scripts/vercel-build.mjs) – nicht bei jedem Start.
  if (!process.env.VERCEL) await migrateDb(db);
  await seedBaseData(db);
  if (process.env.SEED_EXAMPLES === "1") await seedExampleArticles(db);
  if (process.env.SEED_EXAMPLE_MEMBERS === "1") await seedExampleMembers(db, generateMemberToken);
}
