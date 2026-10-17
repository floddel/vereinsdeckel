import { describe, expect, it } from "vitest";
import { changePercent, presetPeriod, previousPeriod, type ReportLine, series, summarize } from "./report";

const line = (articleId: string, quantity: number, unitPrice: number, extra: Partial<ReportLine> = {}): ReportLine => ({
  articleId,
  articleName: articleId === "pils" ? "Pils" : articleId === "schnaps" ? "Schnaps" : "Bockwurst",
  categoryId: articleId === "wurst" ? "essen" : "getraenke",
  businessDate: "2026-10-15",
  quantity,
  totalCents: quantity * unitPrice,
  isGuest: false,
  isReversal: quantity < 0,
  ...extra,
});

// Einkaufspreis je verkaufter Einheit: Pils 0,60 €, Schnaps 4 cl ≈ 0,43 €, Wurst unbekannt
const costs = new Map<string, number | null>([
  ["pils", 60],
  ["schnaps", 42.86],
]);

describe("Abendabschluss / Zeitraum", () => {
  it("Umsatz, Stornos, Gäste, Wareneinsatz und Rohgewinn", () => {
    const s = summarize(
      [
        line("pils", 10, 100),
        line("pils", -2, 100), // Storno
        line("schnaps", 7, 100),
        line("wurst", 3, 150, { isGuest: true }),
      ],
      [],
      costs,
    );
    expect(s).toMatchObject({ revenueCents: 1950, reversedCents: 200, guestCents: 450 });
    // Pils 8 × 60 = 480, Schnaps 7 × 42,86 = 300; Wurst ohne Einkaufspreis
    expect(s.costCents).toBe(780);
    expect(s.uncostedRevenueCents).toBe(450);
    expect(s.profitCents).toBe(1950 - 780);
    expect(s.articles.map((a) => [a.name, a.quantity, a.revenueCents, a.costCents])).toEqual([
      ["Pils", 8, 800, 480],
      ["Schnaps", 7, 700, 300],
      ["Bockwurst", 3, 450, null],
    ]);
    expect(s.byCategory).toEqual({ getraenke: 1500, essen: 450 });
  });

  it("Zahlungen je Art mit Trinkgeld, Stornos negativ", () => {
    const s = summarize(
      [],
      [
        { businessDate: "2026-10-15", methodId: "cash", amountCents: 1450, tipCents: 50 },
        { businessDate: "2026-10-15", methodId: "paypal", amountCents: 800, tipCents: 0 },
        { businessDate: "2026-10-15", methodId: "cash", amountCents: -300, tipCents: 0 },
      ],
      costs,
    );
    expect(s).toMatchObject({ paidCents: 1950, tipCents: 50 });
    expect(s.byMethod).toEqual({ cash: { amountCents: 1150, tipCents: 50 }, paypal: { amountCents: 800, tipCents: 0 } });
  });

  it("vollständig stornierte Artikel fallen aus der Liste", () => {
    const s = summarize([line("pils", 1, 100), line("pils", -1, 100)], [], costs);
    expect(s.articles).toEqual([]);
    expect(s.revenueCents).toBe(0);
  });

  it("Veränderung zum Vorzeitraum", () => {
    expect(changePercent(120, 100)).toBe(20);
    expect(changePercent(80, 100)).toBe(-20);
    expect(changePercent(50, 0)).toBeNull();
  });
});

describe("Zeiträume", () => {
  it("Voreinstellungen", () => {
    expect(presetPeriod("monat", "2026-10-15")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetPeriod("vormonat", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(presetPeriod("vormonat", "2026-01-10")).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetPeriod("quartal", "2026-11-02")).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(presetPeriod("jahr", "2026-10-15")).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(presetPeriod("vorjahr", "2026-10-15")).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(presetPeriod("12monate", "2026-10-15")).toEqual({ from: "2025-11-01", to: "2026-10-31" });
  });

  it("Vorzeitraum: ganze Monate → Monate davor, sonst gleich viele Tage", () => {
    expect(previousPeriod({ from: "2026-03-01", to: "2026-03-31" })).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(previousPeriod({ from: "2026-01-01", to: "2026-12-31" })).toEqual({ from: "2025-01-01", to: "2025-12-31" });
    expect(previousPeriod({ from: "2026-10-01", to: "2026-12-31" })).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(previousPeriod({ from: "2026-10-10", to: "2026-10-16" })).toEqual({ from: "2026-10-03", to: "2026-10-09" });
  });
});

describe("Diagramm", () => {
  it("je Monat mit leeren Monaten, je Abend nur Abende mit Umsatz", () => {
    const lines = [line("pils", 10, 100, { businessDate: "2026-08-07" }), line("pils", 5, 100, { businessDate: "2026-10-02" })];
    const months = series(lines, costs, "month", { from: "2026-08-01", to: "2026-10-31" });
    expect(months.map((p) => [p.key, p.revenueCents, p.profitCents])).toEqual([
      ["2026-08", 1000, 400],
      ["2026-09", 0, 0],
      ["2026-10", 500, 200],
    ]);
    expect(months[0].label).toBe("Aug. 26");
    const evenings = series(lines, costs, "evening", { from: "2026-08-01", to: "2026-10-31" });
    expect(evenings.map((p) => [p.label, p.revenueCents])).toEqual([
      ["7.8.", 1000],
      ["2.10.", 500],
    ]);
  });
});
