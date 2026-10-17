import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { article, purchase } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { createPurchase as create, getPurchase, getReceiptFile, listPurchases, type NewPurchase, reversePurchase } from "./purchases";

let db: Db;

async function createPurchase(...args: [Db, NewPurchase, Parameters<typeof create>[2]]) {
  const r = await create(...args);
  if (!r.ok) throw new Error(r.error);
  return r.id;
}
let pils: string;

beforeEach(async () => {
  db = await createTestDb();
  [{ id: pils }] = await db.insert(article).values({ name: "Pils 0,33", categoryId: "getraenke", priceCents: 200 }).returning();
});

const input = (lines = [{ articleId: pils as string | null, description: "", quantity: 24, totalCents: 1499 }]) => ({
  purchasedOn: "2026-10-15",
  source: "cash" as const,
  note: null,
  lines,
});

describe("Einkäufe", () => {
  it("speichert Einkauf mit Artikelname als Beschreibung und Beleg", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const id = await createPurchase(
      db,
      input([
        { articleId: pils, description: "", quantity: 24, totalCents: 1499 },
        { articleId: null, description: "Servietten", quantity: 1, totalCents: 199 },
      ]),
      { mimeType: "image/jpeg", bytes: jpeg },
    );
    const p = await getPurchase(db, id);
    expect(p).toMatchObject({ source: "cash", totalCents: 1698, reversedReason: null });
    expect(p?.lines.map((l) => l.description).sort()).toEqual(["Pils 0,33", "Servietten"]);
    const f = await getReceiptFile(db, p!.receiptFileId!);
    expect(f?.mimeType).toBe("image/jpeg");
  });

  it("Storno: einmal, mit Begründung, Liste zeigt nur das Original mit Vermerk", async () => {
    const id = await createPurchase(db, input(), null);
    expect(await reversePurchase(db, id, "Falsch erfasst")).toEqual({ ok: true });
    expect(await reversePurchase(db, id, "nochmal")).toEqual({ ok: false, error: "Dieser Einkauf ist schon storniert" });

    const list = await listPurchases(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id, reversedReason: "Falsch erfasst", totalCents: 1499 });
    expect(await db.select().from(purchase)).toHaveLength(2);
  });

  it("Belegfoto nur, wenn es zu einem Einkauf gehört", async () => {
    expect(await getReceiptFile(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });
});

describe("Bon-Summe und Ausschank", () => {
  it("Rest laut Bon wird eigene Zeile, Ausschank-Artikel bekommt die Flaschengröße", async () => {
    const [{ id: cola }] = await db.insert(article).values({ name: "Cola", categoryId: "getraenke", priceCents: 50, servingMl: 200, bottleMl: 1000 }).returning();
    const id = await createPurchase(
      db,
      {
        purchasedOn: "2026-10-15",
        source: "cash",
        note: null,
        receiptTotalCents: 3000,
        lines: [
          { articleId: cola, description: "", quantity: 6, bottleMl: 1250, totalCents: null },
          { articleId: cola, description: "", quantity: 2, totalCents: 300 },
          { articleId: pils, description: "", quantity: 20, bottleMl: 500, totalCents: null },
        ],
      },
      null,
    );
    const p = await getPurchase(db, id);
    expect(p?.totalCents).toBe(3000);
    expect(p?.lines.map((l) => [l.description, l.quantity, l.bottleMl, l.totalCents])).toEqual(
      expect.arrayContaining([
        ["Cola", 6, 1250, null],
        ["Cola", 2, 1000, 300], // übliche Größe des Artikels
        ["Pils 0,33", 20, null, null], // Stückartikel: keine Flaschengröße
        ["Rest laut Bon (ohne Einzelpreis)", 1, null, 2700],
      ]),
    );
  });

  it("ohne Preise und ohne Bon-Summe: Fehler", async () => {
    const r = await create(db, { purchasedOn: "2026-10-15", source: "cash", note: null, lines: [{ articleId: pils, description: "", quantity: 1, totalCents: null }] }, null);
    expect(r).toMatchObject({ ok: false });
  });
});
