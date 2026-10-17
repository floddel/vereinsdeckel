import { describe, expect, it } from "vitest";
import { ABOUT, DEFAULT_SOURCE_CODE_URL, sourceCodeUrl } from "./about";

describe("Über Vereinsdeckel", () => {
  it("Quellcode-Link: Standard oder eigener (AGPL § 13), nur https", () => {
    expect(sourceCodeUrl({})).toBe(DEFAULT_SOURCE_CODE_URL);
    expect(sourceCodeUrl({ SOURCE_CODE_URL: "https://git.example.org/verein/vereinsdeckel" })).toBe("https://git.example.org/verein/vereinsdeckel");
    expect(sourceCodeUrl({ SOURCE_CODE_URL: "javascript:alert(1)" })).toBe(DEFAULT_SOURCE_CODE_URL);
  });

  it("Version kommt aus package.json", () => {
    expect(ABOUT.version).toMatch(/^\d+\.\d+\.\d+/);
  });
});
