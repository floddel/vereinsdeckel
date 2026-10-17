import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("erlaubt interne Pfade", () => {
    expect(safeNextPath("/verwaltung/artikel?x=1", "/theke")).toBe("/verwaltung/artikel?x=1");
  });

  it("lässt den Pfad unverändert, auch mit Anker", () => {
    expect(safeNextPath("/verwaltung/abende/2026-10-15#summe", "/theke")).toBe("/verwaltung/abende/2026-10-15#summe");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    // Browser entfernen Tab und Zeilenumbruch → würde zu "//evil.example"
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "/ /evil.example",
    "/\u0000/evil.example",
    // Punkt-Abschnitte werden beim Auswerten entfernt → "//evil.example"
    "/.//evil.example",
    "/..//evil.example",
    "/a/..//evil.example",
    "/%2e//evil.example",
    "/%2E%2E//evil.example",
    "",
    null,
    42,
  ])(
    "lehnt %j ab",
    (v) => {
      expect(safeNextPath(v, "/theke")).toBe("/theke");
    },
  );
});
