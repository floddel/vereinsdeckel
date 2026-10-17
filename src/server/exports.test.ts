import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { article, member } from "@/db/schema";
import { toCsv } from "@/domain/csv";
import { createTestDb } from "@/db/test-db";
import { buildExport, EXPORTS, type ExportKind } from "./exports";
import { createPurchase } from "./purchases";
import { applyOps } from "./theke/apply-ops";

describe("CSV-Exporte", () => {
  it("Formeln aus Artikelnamen und Storno-Gründen kommen als Text in die Datei", async () => {
    const db = await createTestDb();
    const [{ id: m }] = await db.insert(member).values({ name: "Testmitglied" }).returning();
    const [{ id: a }] = await db.insert(article).values({ name: "Pils", categoryId: "getraenke", priceCents: 100 }).returning();
    const at = "2026-10-15T19:00:00.000Z";
    const saleId = randomUUID();
    await applyOps(
      db,
      [
        { type: "sale", id: saleId, memberId: m, createdAt: at, lines: [{ id: randomUUID(), articleId: a, articleName: "=1+1", quantity: 1, unitPriceCents: 100, isGuest: false }] },
        { type: "reversal", id: randomUUID(), saleId, createdAt: at, reason: "@SUM(1+1)", lines: "all" },
      ],
      { deviceId: "t", cutoffHour: 6, now: new Date(at) },
    );
    const csv = toCsv(await buildExport(db, "buchungen", { from: "2026-10-01", to: "2026-10-31" }));
    expect(csv).toContain(";'=1+1;");
    expect(csv).toContain(";'@SUM(1+1)");
    expect(csv).not.toMatch(/;=1\+1;/);
    expect(csv).toContain(";-1,00;"); // Beträge bleiben Zahlen
  });

  it("liefern Überschrift und Zeilen im Zeitraum", async () => {
    const db = await createTestDb();
    const [{ id: klaus }] = await db.insert(member).values({ name: "Klaus Müller" }).returning();
    const [{ id: pils }, { id: schnaps }] = await db
      .insert(article)
      .values([
        { name: "Pils", categoryId: "getraenke", priceCents: 100 },
        { name: "Schnaps", categoryId: "getraenke", priceCents: 100, servingMl: 40, bottleMl: 700 },
      ])
      .returning();
    await createPurchase(
      db,
      {
        purchasedOn: "2026-10-15",
        source: "opening",
        note: "Inventur",
        lines: [
          { articleId: pils, description: "Kindl", quantity: 20, totalCents: 1600 },
          { articleId: schnaps, description: "Liköre", quantity: 2, bottleMl: 700, totalCents: 1500 },
        ],
      },
      null,
    );
    const at = "2026-10-15T19:00:00.000Z";
    const saleId = randomUUID();
    const lineId = randomUUID();
    await applyOps(
      db,
      [
        { type: "sale", id: saleId, memberId: klaus, createdAt: at, lines: [{ id: lineId, articleId: pils, articleName: "Pils", quantity: 3, unitPriceCents: 100, isGuest: false }] },
        { type: "reversal", id: randomUUID(), saleId, createdAt: at, reason: "Versehen", lines: [{ lineId, quantity: 1 }] },
        { type: "payment", id: randomUUID(), memberId: klaus, createdAt: at, methodId: "cash", amountCents: 100, tipCents: 20, cashGivenCents: 200, saleId: null },
      ],
      { deviceId: "t", cutoffHour: 6, now: new Date(at) },
    );
    const oct = { from: "2026-10-01", to: "2026-10-31" };
    const run = (k: ExportKind, p = oct) => buildExport(db, k, p);

    expect(await run("buchungen")).toEqual([
      ["Abend", "Uhrzeit", "Bon", "Mitglied", "Artikel", "Kategorie", "Menge", "Einzelpreis", "Summe", "Gast", "Storno", "Grund"],
      ["15.10.2026", "21:00", saleId.slice(0, 8), "Klaus Müller", "Pils", "Getränke", 3, "1,00", "3,00", "", "", ""],
      ["15.10.2026", "21:00", expect.any(String), "Klaus Müller", "Pils", "Getränke", -1, "1,00", "-1,00", "", "ja", "Versehen"],
    ]);
    expect((await run("zahlungen"))[1]).toEqual(["15.10.2026", "21:00", "Klaus Müller", "Bar", "1,00", "0,20", "1,20", "2,00", "", ""]);
    expect((await run("abende"))[1]).toEqual(["15.10.2026", "", "2,00", "1,00", "0,20", "0,40", ""]);
    expect((await run("artikel"))[1]).toEqual(["Pils", "Getränke", 2, "2,00", "1,60", "0,40"]);
    expect((await run("einkaeufe")).slice(1).map((r) => [r[1], r[4], r[5], r[6], r[7]])).toEqual([
      ["Anfangsbestand", "Kindl", 20, "", "16,00"],
      ["Anfangsbestand", "Liköre", 2, 700, "15,00"],
    ]);
    expect((await run("bestand")).slice(1)).toEqual([
      ["Pils", "Getränke", "", 18, "Stück", "14,40"],
      ["Schnaps", "Getränke", "", "1,4", "Liter", "15,00"],
    ]);
    expect((await run("mitglieder"))[1]).toEqual(["Klaus Müller", "ja", "1,00"]);
    // anderer Zeitraum: nur Überschriften
    for (const k of ["buchungen", "zahlungen", "abende", "einkaeufe"] as const) expect(await run(k, { from: "2026-09-01", to: "2026-09-30" })).toHaveLength(1);
    expect(Object.keys(EXPORTS)).toHaveLength(7);
  });
});
