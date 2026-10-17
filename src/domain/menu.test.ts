import { describe, expect, it } from "vitest";
import { buildMenu, type MenuArticleRow } from "./menu";

const row = (id: string, over: Partial<MenuArticleRow> = {}): MenuArticleRow => ({
  id,
  name: id,
  icon: "beer",
  categoryId: "getraenke",
  priceCents: 100,
  description: null,
  servingMl: null,
  stockArticleId: null,
  dailySpecial: false,
  offeredOn: null,
  ...over,
});
const today = "2026-10-16";
const noTip = { articleId: null, text: null };

describe("Karte", () => {
  it("gruppiert für Gäste und zeigt nur, was da ist", () => {
    const m = buildMenu(
      [
        row("pils"),
        row("leer"),
        row("cola", { icon: "soda" }),
        row("korn", { icon: "shot", servingMl: 20 }),
        row("wurst", { icon: "sausage", categoryId: "essen" }),
        row("eintritt", { icon: "ticket", categoryId: "sonstiges" }),
      ],
      { pils: 24, leer: 0, korn: 50 },
      today,
      noTip,
    );
    expect(m.sections.map((s) => [s.id, s.items.map((i) => i.id)])).toEqual([
      ["bier", ["pils"]],
      ["schnaps", ["korn"]],
      ["alkoholfrei", ["cola"]],
      ["essen", ["wurst"]],
    ]);
    expect(m.sections[0].items[0].left).toBe(24);
    expect(m.sections[1].items[0].left).toBe(2); // 50 ml / 20 ml
    expect(m.sections[2].items[0].left).toBeNull(); // ohne Bestandsführung
  });

  it("selbst Gekochtes nur an dem Abend, für den es eingeschaltet ist – und nicht in den Gruppen", () => {
    const rows = [
      row("eintopf", { icon: "soup", categoryId: "essen", dailySpecial: true, offeredOn: today, description: "Linsen mit Mettwurst" }),
      row("salat", { icon: "other", categoryId: "essen", dailySpecial: true, offeredOn: "2026-10-09" }),
      row("gulasch", { icon: "soup", categoryId: "essen", dailySpecial: true, offeredOn: null }),
    ];
    const m = buildMenu(rows, {}, today, noTip);
    expect(m.specials.map((i) => [i.id, i.description])).toEqual([["eintopf", "Linsen mit Mettwurst"]]);
    expect(m.sections).toEqual([]);
  });

  it("Tipp des Hauses nur, wenn der Artikel heute da ist", () => {
    const rows = [row("likoer", { icon: "shot" }), row("leer", { icon: "shot" })];
    expect(buildMenu(rows, { leer: 0 }, today, { articleId: "likoer", text: "Muss weg!" }).tip).toMatchObject({
      item: { id: "likoer" },
      text: "Muss weg!",
    });
    expect(buildMenu(rows, { leer: 0 }, today, { articleId: "leer", text: "x" }).tip).toBeNull();
    expect(buildMenu(rows, {}, today, { articleId: "gibts-nicht", text: "x" }).tip).toBeNull();
  });
});
