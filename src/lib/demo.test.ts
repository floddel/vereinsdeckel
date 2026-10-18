import { describe, expect, it } from "vitest";
import { demoEndsAt, isDemo } from "./demo";

describe("isDemo", () => {
  it("ist ohne DEMO_MODE aus", () => {
    expect(isDemo({})).toBe(false);
  });

  it("schaltet nur mit genau „1“ ein", () => {
    expect(isDemo({ DEMO_MODE: "1" })).toBe(true);
    for (const value of ["", "0", "true", "ja", " 1", "1 "]) expect(isDemo({ DEMO_MODE: value })).toBe(false);
  });
});

describe("demoEndsAt", () => {
  it("liest das Ende als ISO-Zeit", () => {
    expect(demoEndsAt({ DEMO_ENDS_AT: "2026-10-18T12:35:00Z" })?.toISOString()).toBe("2026-10-18T12:35:00.000Z");
  });

  it("ohne oder mit ungültigem Wert: kein Ende", () => {
    expect(demoEndsAt({})).toBeNull();
    expect(demoEndsAt({ DEMO_ENDS_AT: "  " })).toBeNull();
    expect(demoEndsAt({ DEMO_ENDS_AT: "morgen" })).toBeNull();
  });
});
