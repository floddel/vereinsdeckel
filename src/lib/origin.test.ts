import { describe, expect, it } from "vitest";
import { isTestOrigin } from "./origin";

describe("isTestOrigin", () => {
  it("erkennt Test-Adressen", () => {
    for (const o of [
      "http://localhost:3000",
      "http://192.168.1.20:3000",
      "https://192.168.1.20",
      "http://127.0.0.1:3000",
      "https://mac.local",
      "https://[::1]:3000",
      "http://vereinsdeckel.example.org",
      "unsinn",
    ]) {
      expect(isTestOrigin(o), o).toBe(true);
    }
  });

  it("echte Adressen mit https sind in Ordnung", () => {
    expect(isTestOrigin("https://vereinsdeckel.vercel.app")).toBe(false);
    expect(isTestOrigin("https://bierdeckel.angelverein-musterstadt.de")).toBe(false);
  });
});
