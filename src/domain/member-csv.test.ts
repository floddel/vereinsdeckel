import { describe, expect, it } from "vitest";
import { cleanName, nameKey, parseCsv, parseMemberCsv } from "./member-csv";

describe("parseCsv", () => {
  it("versteht Anführungszeichen, Trennzeichen im Feld und Zeilenumbrüche", () => {
    expect(parseCsv('a;"b;c";"d ""x"""\r\n1;2;3', ";")).toEqual([
      ["a", "b;c", 'd "x"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("parseMemberCsv", () => {
  it("Excel-Export mit Kopfzeile: nur der Name wird übernommen, Nummer und E-Mail nicht", () => {
    const csv = "﻿Mitgliedsnummer;Name;E-Mail\n101;Klaus Müller;klaus@example.org\n102;Jürgen Weiß;\n";
    expect(parseMemberCsv(csv)).toEqual({
      rows: [
        { line: 2, name: "Klaus Müller" },
        { line: 3, name: "Jürgen Weiß" },
      ],
      errors: [],
      ignoredColumns: ["Mitgliedsnummer", "E-Mail"],
    });
  });

  it("Vorname und Nachname in getrennten Spalten werden zusammengesetzt", () => {
    const { rows, ignoredColumns } = parseMemberCsv("Nachname;Vorname;Straße\nMüller;Klaus;Seeweg 1\nWeiß; Jürgen ;\n");
    expect(rows.map((r) => r.name)).toEqual(["Klaus Müller", "Jürgen Weiß"]);
    expect(ignoredColumns).toEqual(["Straße"]);
  });

  it("nur Vorname vorhanden reicht auch", () => {
    expect(parseMemberCsv("Vorname\nKlaus\n").rows.map((r) => r.name)).toEqual(["Klaus"]);
  });

  it("ohne Kopfzeile: erste Spalte ist der Name", () => {
    const { rows, ignoredColumns } = parseMemberCsv("Klaus Müller,101\nPeter,\n");
    expect(rows.map((r) => r.name)).toEqual(["Klaus Müller", "Peter"]);
    expect(ignoredColumns).toEqual([]);
  });

  it("meldet fehlende und doppelte Namen je Zeile und überspringt leere Zeilen", () => {
    const csv = "Name;E-Mail\n;x@example.org\nKlaus\n\nPeter\nklaus  \n";
    const { rows, errors } = parseMemberCsv(csv);
    expect(rows.map((r) => r.name)).toEqual(["Klaus", "Peter"]);
    expect(errors).toEqual([
      { line: 2, message: "Name fehlt" },
      { line: 6, message: "„klaus“ steht doppelt in der Datei" },
    ]);
  });
});

describe("Namen vergleichen", () => {
  it("Leerzeichen und Groß-/Kleinschreibung spielen keine Rolle", () => {
    expect(cleanName("  Klaus   Müller ")).toBe("Klaus Müller");
    expect(nameKey("KLAUS  müller")).toBe(nameKey("Klaus Müller"));
  });
});
