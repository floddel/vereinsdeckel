import { describe, expect, it } from "vitest";
import { coastersNeeded, groupTally, tallyBlocks } from "./tally";
import type { LineEntry } from "./types";

describe("tallyBlocks (Fünferblöcke)", () => {
  it.each([
    [0, 0, 0],
    [1, 0, 1],
    [4, 0, 4],
    [5, 1, 0],
    [7, 1, 2],
    [10, 2, 0],
    [23, 4, 3],
  ])("%i Striche → %i Blöcke + %i", (count, blocks, rest) => {
    expect(tallyBlocks(count)).toEqual({ blocks, rest });
  });

  it("negative Werte ergeben keine Striche", () => {
    expect(tallyBlocks(-2)).toEqual({ blocks: 0, rest: 0 });
  });
});

let n = 0;
const line = (name: string, qty: number, extra: Partial<LineEntry> = {}): LineEntry => ({
  kind: "line",
  id: `l${++n}`,
  at: new Date(2026, 9, 14, 20, n),
  articleId: name,
  articleName: name,
  quantity: qty,
  unitPriceCents: 200,
  totalCents: qty * 200,
  isGuest: false,
  ...extra,
});

describe("groupTally", () => {
  it("fasst Artikel einer Strich-Gruppe zusammen", () => {
    const groups = groupTally([
      line("Pils", 3, { tallyGroup: "Bier", icon: "beer" }),
      line("Cola", 1, { icon: "soda" }),
      line("Radler", 2, { tallyGroup: "Bier", icon: "beer" }),
    ]);
    expect(groups.map((g) => [g.label, g.count, g.icon])).toEqual([
      ["Bier", 5, "beer"],
      ["Cola", 1, "soda"],
    ]);
    expect(groups[0].totalCents).toBe(1000);
  });

  it("verrechnet Stornos, leere Gruppen verschwinden", () => {
    const groups = groupTally([
      line("Pils", 2),
      line("Cola", 1),
      line("Cola", -1, { reversesLineId: "x" }),
      line("Pils", -1, { reversesLineId: "y" }),
    ]);
    expect(groups.map((g) => [g.label, g.count])).toEqual([["Pils", 1]]);
  });

  it("zählt Gäste mit", () => {
    const [g] = groupTally([line("Pils", 2), line("Pils", 1, { isGuest: true })]);
    expect(g.count).toBe(3);
    expect(g.guestCount).toBe(1);
  });

  it("voller Deckel → zweiter Deckel", () => {
    expect(coastersNeeded(groupTally([line("Pils", 30)]))).toBe(1);
    expect(coastersNeeded(groupTally([line("Pils", 61)]))).toBe(2);
    expect(coastersNeeded([])).toBe(1);
  });
});
