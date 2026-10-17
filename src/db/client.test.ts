import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPgliteDb } from "./client";

describe("Datenbank (PGlite)", () => {
  it("startet und beantwortet eine Abfrage", async () => {
    const db = createPgliteDb();
    const result = (await db.execute(sql`select 1 + 1 as answer`)) as unknown as { rows: { answer: number }[] };
    expect(result.rows[0].answer).toBe(2);
  });
});
