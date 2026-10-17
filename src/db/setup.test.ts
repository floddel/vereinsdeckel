import { describe, expect, it } from "vitest";
import { getStockOverview } from "@/server/stock";
import { insertStarterArticles, STARTER_ARTICLES } from "./setup";
import { createTestDb } from "./test-db";

describe("Startvorlage (Einrichtung)", () => {
  it("legt die Artikel einmal an – ohne erfundenen Bestand", async () => {
    const db = await createTestDb();
    expect(await insertStarterArticles(db)).toHaveLength(STARTER_ARTICLES.length);
    expect(await insertStarterArticles(db)).toEqual([]); // gibt es schon Artikel, passiert nichts
    expect((await getStockOverview(db)).rows.every((r) => r.stock === 0)).toBe(true);
  });
});
