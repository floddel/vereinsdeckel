import { describe, expect, it } from "vitest";
import { formatCents, formatCentsPlain, parseEuroToCents } from "./money";

// Zwischen Zahl und € steht ein geschütztes Leerzeichen (U+00A0), wie bei Intl.
const nb = " ";

describe("formatCents", () => {
  it("zeigt Cent als Euro mit Komma", () => {
    expect(formatCents(1450)).toBe(`14,50${nb}€`);
    expect(formatCents(0)).toBe(`0,00${nb}€`);
    expect(formatCents(5)).toBe(`0,05${nb}€`);
    expect(formatCents(123456)).toBe(`1.234,56${nb}€`);
    expect(formatCents(-250)).toBe(`-2,50${nb}€`);
    expect(formatCents(123456789)).toBe(`1.234.567,89${nb}€`);
  });

  it("gleiches Ergebnis wie Intl (aber ohne Abhängigkeit vom Gerät)", () => {
    const intl = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
    for (const c of [0, 7, 99, 100, 1450, 99999, 100000, 123456789]) expect(formatCents(c)).toBe(intl.format(c / 100));
  });

  it("lehnt Kommazahlen ab", () => {
    expect(() => formatCents(14.5)).toThrow();
  });
});

describe("parseEuroToCents", () => {
  it.each([
    ["14,50", 1450],
    ["14.50", 1450],
    ["14,5", 1450],
    ["14", 1400],
    [" 20 € ", 2000],
    ["0,05", 5],
  ])("%s → %i Cent", (input, cents) => {
    expect(parseEuroToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "14,555", "1,2,3", "€"])("ungültig: %j", (input) => {
    expect(parseEuroToCents(input)).toBeNull();
  });
});

describe("formatCentsPlain", () => {
  it("für Eingabefelder", () => {
    expect(formatCentsPlain(1450)).toBe("14,50");
    expect(formatCentsPlain(5)).toBe("0,05");
    expect(formatCentsPlain(-200)).toBe("-2,00");
  });
});
