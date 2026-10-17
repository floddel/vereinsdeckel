import { describe, expect, it } from "vitest";
import { describeStock, toBase } from "./stock";
import { bottlesToMl, formatVolume, oneDecimal, parseVolumeMl } from "./volume";

describe("Mengen", () => {
  it("liest übliche Schreibweisen", () => {
    expect(parseVolumeMl("4 cl")).toBe(40);
    expect(parseVolumeMl("2cl")).toBe(20);
    expect(parseVolumeMl("0,2 l")).toBe(200);
    expect(parseVolumeMl("0.7")).toBe(700);
    expect(parseVolumeMl("1,25")).toBe(1250);
    expect(parseVolumeMl("700 ml")).toBe(700);
    expect(parseVolumeMl("700")).toBe(700);
    expect(parseVolumeMl("viel")).toBeNull();
    expect(parseVolumeMl("0")).toBeNull();
  });

  it("schreibt Mengen verständlich", () => {
    expect(formatVolume(40)).toBe("4 cl");
    expect(formatVolume(20)).toBe("2 cl");
    expect(formatVolume(200)).toBe("0,2 l");
    expect(formatVolume(700)).toBe("0,7 l");
    expect(formatVolume(1250)).toBe("1,25 l");
    expect(formatVolume(35)).toBe("35 ml");
    expect(oneDecimal(1.43)).toBe("1,4");
  });

  it("Inventur: volle + angebrochene Flasche", () => {
    expect(bottlesToMl(2, 0.5, 700)).toBe(1750);
    expect(bottlesToMl(0, 0.25, 1000)).toBe(250);
  });
});

describe("Bestandseinheiten", () => {
  const jack = { servingMl: 40, bottleMl: 700, packSize: null };
  const cola = { servingMl: 200, bottleMl: 1000, packSize: null };
  const bier = { servingMl: null, bottleMl: null, packSize: 20 };
  const fmt = { volume: formatVolume, decimal: oneDecimal };

  it("Ausschank in ml: Einkauf nach Flaschengröße, Verkauf je Portion", () => {
    expect(toBase.purchase(cola, 6, 1250)).toBe(7500); // 6 × 1,25 l
    expect(toBase.purchase(cola, 2, null)).toBe(2000); // übliche Größe 1 l
    expect(toBase.sale(jack, 3)).toBe(120);
    expect(toBase.inventory(jack, 1750, true)).toBe(1750);
    expect(toBase.inventory(jack, 2, false)).toBe(1400); // alte Zählung in Flaschen
  });

  it("Stückartikel bleiben in Stück", () => {
    expect(toBase.purchase(bier, 40, null)).toBe(40);
    expect(toBase.sale(bier, 3)).toBe(3);
  });

  it("Anzeige", () => {
    // Stück ohne Umrechnung in Kisten (es stehen nicht immer volle Kisten da)
    expect(describeStock(bier, 47, fmt)).toBe("47");
    expect(describeStock(bier, 7, fmt)).toBe("7");
    expect(describeStock(jack, 1000, fmt)).toBe("≈ 1,4 Fl. · 25 × 4 cl");
    expect(describeStock({ servingMl: 200, bottleMl: null, packSize: null }, 3100, fmt)).toBe("3,1 l · 15 × 0,2 l");
  });
});
