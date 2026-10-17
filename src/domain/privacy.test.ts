import { describe, expect, it } from "vitest";
import { activeProcessors, anonymousName, AUTHORITIES, checksFor, type Hosting, missingPrivacyFields, privacyFacts } from "./privacy";

describe("Datenschutz", () => {
  it("Anonyme Namen sind fortlaufend", () => {
    expect(anonymousName(["Klaus Müller"])).toBe("Ehemaliges Mitglied #1");
    expect(anonymousName(["Ehemaliges Mitglied #1", "Ehemaliges Mitglied #7", "Peter"])).toBe("Ehemaliges Mitglied #8");
  });

  it("fehlende Angaben im Datenschutzhinweis", () => {
    expect(missingPrivacyFields({ controller: "Max Hauswart", address: " ", email: null, authority: "x" })).toEqual(["Anschrift", "E-Mail für Datenschutzfragen"]);
  });

  const vercel: Hosting = { kind: "vercel-neon", name: null, location: null, contract: null };
  const own: Hosting = { kind: "own", name: null, location: null, contract: null };
  const hetzner: Hosting = { kind: "provider", name: "Hetzner Online GmbH", location: "Falkenstein (Deutschland)", contract: "hetzner.com/AV" };

  it("Anthropic nur mit eingeschalteter KI, alle 16 Länder", () => {
    expect(activeProcessors(vercel, false).map((p) => p.name)).toEqual(["Neon (Databricks)", "Vercel"]);
    expect(activeProcessors(vercel, true)).toHaveLength(3);
    expect(AUTHORITIES).toHaveLength(16);
  });

  it("Auftragsverarbeiter, Checkliste und „Auf einen Blick“ passen sich dem Hosting an", () => {
    expect(activeProcessors(own, false)).toEqual([]);
    expect(activeProcessors(own, true).map((p) => p.name)).toEqual(["Anthropic"]);
    expect(activeProcessors(hetzner, false)).toMatchObject([{ name: "Hetzner Online GmbH", location: "Falkenstein (Deutschland)", contract: "hetzner.com/AV" }]);

    expect(checksFor(vercel, false).map((c) => c.id)).toEqual(["avv-db", "avv-hosting", "geprueft", "bekannt"]);
    expect(checksFor(own, true).map((c) => c.id)).toEqual(["geraet", "avv-ai", "geprueft", "bekannt"]);
    expect(checksFor(hetzner, false).map((c) => c.id)).toEqual(["avv-provider", "geprueft", "bekannt"]);

    const where = (h: Hosting) => privacyFacts(h)[3];
    expect(where(vercel).text).toContain("Frankfurt am Main");
    expect(where(own).title).toBe("Daten bleiben bei uns");
    expect(where(hetzner).text).toBe("Die App läuft bei Hetzner Online GmbH (Falkenstein (Deutschland)).");
  });
});
