import { describe, expect, it } from "vitest";
import { accentVars, contrast, customAccent, hexToLinear, isAccent, parseCustomAccent } from "./accent";

const WHITE = hexToLinear("#ffffff");
const DARK_CARD = hexToLinear("#1c1c1e");

describe("Eigene Vereinsfarbe", () => {
  it("wird als „eigen-Farbton-Kräftigkeit“ gespeichert und geprüft", () => {
    expect(customAccent(210, 70)).toBe("eigen-210-70");
    expect(customAccent(370.4, 120)).toBe("eigen-10-100");
    expect(parseCustomAccent("eigen-359-0")).toEqual({ hue: 359, strength: 0 });
    expect(isAccent("eigen-210-70")).toBe(true);
    expect(isAccent("petrol")).toBe(true);
    for (const bad of ["eigen-360-50", "eigen-10-101", "eigen-1-2-3", "eigen--5-10", "pink", 42, null]) expect(isAccent(bad)).toBe(false);
  });

  it("ist für jeden Farbton und jede Kräftigkeit in Hell und Dunkel lesbar", () => {
    for (let hue = 0; hue < 360; hue += 5) {
      for (const strength of [0, 25, 50, 75, 100]) {
        const v = accentVars(hue, strength);
        for (const hex of Object.values(v)) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
        const light = hexToLinear(v["--tint-light"]);
        const dark = hexToLinear(v["--tint-dark"]);
        const label = `Farbton ${hue}, Kräftigkeit ${strength}`;
        // Hell: weiße Schrift auf Knöpfen, Farbe als Schrift auf Weiß
        expect(contrast(light, WHITE), label).toBeGreaterThanOrEqual(4.5);
        // Dunkel: Farbe als Schrift auf dunklen Karten, Schrift auf Knöpfen
        expect(contrast(dark, DARK_CARD), label).toBeGreaterThanOrEqual(4.5);
        expect(contrast(dark, hexToLinear(v["--on-tint-dark"])), label).toBeGreaterThanOrEqual(4.5);
        // Bierdeckel-Rand mit weißer Schrift
        expect(contrast(hexToLinear(v["--print"]), WHITE), label).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it("ohne Kräftigkeit ist es ein Grau, mit voller Kräftigkeit eine bunte Farbe", () => {
    const grau = hexToLinear(accentVars(30, 0)["--tint-light"]);
    expect(Math.max(...grau) - Math.min(...grau)).toBeLessThan(0.01);
    const rot = hexToLinear(accentVars(25, 100)["--tint-light"]);
    expect(rot[0]).toBeGreaterThan(rot[2] * 3);
  });
});
