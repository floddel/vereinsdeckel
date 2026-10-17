import { createPgliteDb, type Db } from "./client";
import { migrateDb, seedBaseData } from "./setup";

/** Frische Datenbank im Arbeitsspeicher mit Schema und Grunddaten (nur für Tests). */
export async function createTestDb(): Promise<Db> {
  const db = createPgliteDb();
  await migrateDb(db);
  await seedBaseData(db);
  return db;
}
