import { describe, expect, it } from "vitest";
import { csvCell, csvDate, csvEuro, csvNumber, toCsv } from "./csv";

describe("CSV für Excel", () => {
  it("Semikolon, Dezimalkomma, BOM, Anführungszeichen nur wenn nötig", () => {
    expect(csvEuro(1250)).toBe("12,50");
    expect(csvEuro(-300)).toBe("-3,00");
    expect(csvDate("2026-10-15")).toBe("15.10.2026");
    expect(csvNumber(1.75)).toBe("1,75");
    expect(toCsv([["Artikel", "Preis"], ['Hugo "Délice"; 0,75', csvEuro(349)]])).toBe('﻿Artikel;Preis\r\n"Hugo ""Délice""; 0,75";3,49\r\n');
  });

  it("Text, der wie eine Formel aussieht, bleibt Text", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+49 170 123")).toBe("'+49 170 123");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@SUM(1+1)")).toBe("'@SUM(1+1)");
    expect(csvCell("\t=1+1")).toBe("'\t=1+1");
    expect(csvCell('=HYPERLINK("http://x";"Klick")')).toBe(`"'=HYPERLINK(""http://x"";""Klick"")"`);
    // Zahlen und normaler Text bleiben unverändert
    expect(csvCell(csvEuro(-300))).toBe("-3,00");
    expect(csvCell(String(-2))).toBe("-2");
    expect(csvCell(csvNumber(-1.75))).toBe("-1,75");
    expect(csvCell("Pils 0,33")).toBe("Pils 0,33");
    expect(csvCell("")).toBe("");
  });
});
