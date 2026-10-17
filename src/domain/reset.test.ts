import { describe, expect, it } from "vitest";
import { isResetArea, planReset, requiredBy } from "./reset";

describe("Daten zurücksetzen: Abhängigkeiten", () => {
  it("Mitglieder löschen nimmt ihre Buchungen mit – Inventur und Einkäufe bleiben", () => {
    expect(planReset(["mitglieder"], true)).toEqual({ areas: ["buchungen", "mitglieder"], keepOpening: true });
  });

  it("Artikel löschen nimmt Buchungen, Einkäufe (auch den Anfangsbestand) und Inventuren mit", () => {
    expect(planReset(["artikel"], true)).toEqual({ areas: ["buchungen", "einkaeufe", "inventuren", "artikel"], keepOpening: false });
  });

  it("einzelne Bereiche ohne Abhängigkeiten bleiben allein, Reihenfolge ist fest", () => {
    expect(planReset(["kasse", "buchungen"], false).areas).toEqual(["buchungen", "kasse"]);
    expect(planReset([], true)).toEqual({ areas: [], keepOpening: true });
  });

  it("zeigt, warum ein Bereich zwangsweise dabei ist", () => {
    expect(requiredBy("buchungen", ["mitglieder"])).toBe("mitglieder");
    expect(requiredBy("inventuren", ["kasse", "artikel"])).toBe("artikel");
    expect(requiredBy("kasse", ["mitglieder"])).toBeNull();
    expect(requiredBy("mitglieder", ["mitglieder"])).toBeNull();
  });

  it("nimmt nur bekannte Bereiche an", () => {
    expect(isResetArea("artikel")).toBe(true);
    for (const bad of ["auth", "settings", "", null, 1]) expect(isResetArea(bad)).toBe(false);
  });
});
