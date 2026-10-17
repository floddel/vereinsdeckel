import { describe, expect, it } from "vitest";
import { formatBusinessDay } from "./date";

describe("formatBusinessDay", () => {
  it("deutsches Kurzdatum, unabhängig vom Gerät", () => {
    expect(formatBusinessDay("2026-10-15")).toBe("Do., 15. Okt.");
    expect(formatBusinessDay("2026-03-01")).toBe("So., 1. März");
    expect(formatBusinessDay("2027-01-04")).toBe("Mo., 4. Jan.");
  });
});

describe("Kassenzettel-Datum und Uhrzeit", () => {
  it("formatiert Datum und Uhrzeit in deutscher Zeit", async () => {
    const { formatBusinessDayNumeric, formatTimeBerlin } = await import("./date");
    expect(formatBusinessDayNumeric("2026-10-10")).toBe("Sa., 10.10.2026");
    expect(formatTimeBerlin("2026-10-10T17:42:00.000Z")).toBe("19:42");
    expect(formatTimeBerlin("2026-12-10T23:05:00.000Z")).toBe("00:05");
  });
});
