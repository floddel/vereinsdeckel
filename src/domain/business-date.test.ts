import { describe, expect, it } from "vitest";
import { businessDate } from "./business-date";

describe("businessDate", () => {
  it.each([
    ["2026-10-14T20:00:00+02:00", "2026-10-14", "abends"],
    ["2026-10-14T23:59:00+02:00", "2026-10-14", "kurz vor Mitternacht"],
    ["2026-10-15T01:30:00+02:00", "2026-10-14", "nach Mitternacht → noch Vorabend"],
    ["2026-10-15T05:59:00+02:00", "2026-10-14", "kurz vor dem Wechsel"],
    ["2026-10-15T06:00:00+02:00", "2026-10-15", "ab 06:00 neuer Tag"],
    ["2026-10-25T02:30:00+01:00", "2026-10-24", "Nacht der Zeitumstellung"],
    ["2027-01-01T02:00:00+01:00", "2026-12-31", "Silvester"],
    ["2027-03-01T03:00:00+01:00", "2027-02-28", "Monatswechsel"],
  ])("%s → %s (%s)", (iso, expected) => {
    expect(businessDate(new Date(iso))).toBe(expected);
  });

  it("Wechselzeit ist einstellbar", () => {
    expect(businessDate(new Date("2026-10-15T03:00:00+02:00"), 2)).toBe("2026-10-15");
    expect(businessDate(new Date("2026-10-15T03:00:00+02:00"), 0)).toBe("2026-10-15");
  });
});
