import { describe, expect, it } from "vitest";
import { aliasFromLine, buildPrompt, normalizeReceiptText, recognitionSchema, toSuggestion } from "./receipt-recognition";

const PILS = "11111111-1111-4111-8111-111111111111";
const JACK = "22222222-2222-4222-8222-222222222222";
const articles = [
  { id: PILS, name: "Pils 0,5", servingMl: null, bottleMl: null, packSize: 20 },
  { id: JACK, name: "Jack Daniels", servingMl: 40, bottleMl: 700, packSize: null },
];

const recognized = (positionen: unknown[]) =>
  recognitionSchema.parse({ haendler: "Metro", datum: "2026-10-14", summe_cents: 5000, positionen });

describe("Kassenbon-Erkennung", () => {
  it("vereinheitlicht Bon-Texte", () => {
    expect(normalizeReceiptText("  Kromb. Pils   20x0,5l ")).toBe("KROMB. PILS 20X0,5L");
  });

  it("Prompt enthält Artikel und gelernte Zuordnungen", () => {
    const p = buildPrompt(articles, [{ text: "KROMB.PILS 20X0,5L", articleId: PILS, unitsPerItem: 20, bottleMl: null }]);
    expect(p).toContain(`id=${PILS} · Pils 0,5 · Stück, Kiste 20`);
    expect(p).toContain(`id=${JACK} · Jack Daniels · Ausschank 4 cl, übliche Flasche 0,7 l`);
    expect(p).toContain("„KROMB.PILS 20X0,5L“ → Pils 0,5 (20 Stück je Menge)");
    expect(buildPrompt([{ ...articles[1], note: "Jack, Jim Beam" }], [])).toContain("Jack Daniels · Ausschank 4 cl, übliche Flasche 0,7 l · umfasst: Jack, Jim Beam");
  });

  it("Kisten werden als Kisten, Einzelflaschen als Stück eingetragen", () => {
    const s = toSuggestion(
      recognized([
        { bon_text: "KROMB PILS 20X0,5", menge: 2, gesamt_cents: 3398, artikel_id: PILS, stueck_je_menge: 20, flasche_ml: null },
        { bon_text: "KROMB PILS 0,5 EINZELN", menge: 3, gesamt_cents: 270, artikel_id: PILS, stueck_je_menge: 1, flasche_ml: null },
        { bon_text: "JACK DANIELS 0,7L", menge: 1, gesamt_cents: 2199, artikel_id: JACK, stueck_je_menge: null, flasche_ml: 700 },
        { bon_text: "PFAND", menge: 1, gesamt_cents: 900, artikel_id: null, stueck_je_menge: null, flasche_ml: null },
      ]),
      articles,
      [],
    );
    expect(s.lines.map((l) => [l.articleId, l.crates, l.count, l.bottleMl, l.totalCents, l.description])).toEqual([
      [PILS, 2, 0, null, 3398, ""],
      [PILS, 0, 3, null, 270, ""],
      [JACK, 0, 1, 700, 2199, ""],
      [null, 0, 1, null, 900, "PFAND"],
    ]);
    expect(s).toMatchObject({ purchasedOn: "2026-10-14", merchant: "Metro", receiptTotalCents: 5000 });
  });

  it("gelernte Zuordnung hat Vorrang, unbekannte Artikel-IDs werden verworfen", () => {
    const s = toSuggestion(
      recognized([
        { bon_text: "Kromb.Pils 20x0,5L", menge: 1, gesamt_cents: 1699, artikel_id: null, stueck_je_menge: null, flasche_ml: null },
        { bon_text: "ERFUNDEN", menge: 1, gesamt_cents: 100, artikel_id: "33333333-3333-4333-8333-333333333333", stueck_je_menge: 1, flasche_ml: null },
      ]),
      articles,
      [{ text: "KROMB.PILS 20X0,5L", articleId: PILS, unitsPerItem: 20, bottleMl: null }],
    );
    expect(s.lines[0]).toMatchObject({ articleId: PILS, crates: 1, fromAlias: true });
    expect(s.lines[1]).toMatchObject({ articleId: null, description: "ERFUNDEN", fromAlias: false });
  });

  it("verkraftet unvollständige Antworten", () => {
    const r = recognitionSchema.parse({ haendler: null, datum: "14.10.2026", summe_cents: -5, positionen: [] });
    expect(r).toEqual({ haendler: null, datum: null, summe_cents: null, positionen: [] });
  });

  it("lernt Bon-Text → Artikel mit Stück je Menge bzw. Flaschengröße", () => {
    expect(aliasFromLine({ receiptText: "kromb pils 20x0,5", receiptQty: 2, articleId: PILS, quantity: 40, bottleMl: null, served: false })).toEqual({
      text: "KROMB PILS 20X0,5",
      articleId: PILS,
      unitsPerItem: 20,
      bottleMl: null,
    });
    expect(aliasFromLine({ receiptText: "JACK 0,7", receiptQty: 1, articleId: JACK, quantity: 1, bottleMl: 700, served: true })).toMatchObject({ bottleMl: 700 });
    expect(aliasFromLine({ receiptText: "PFAND", receiptQty: 1, articleId: null, quantity: 1, bottleMl: null, served: false })).toBeNull();
  });
});
