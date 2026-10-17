import { describe, expect, it } from "vitest";
import { formatPaypalAmount, isValidPaypalName, paypalMeLink } from "./paypal";

describe("PayPal.me-Link", () => {
  it("Format laut Vorgabe", () => {
    expect(paypalMeLink("Angelverein", 1450)).toBe("https://paypal.me/Angelverein/14.50EUR");
  });

  it.each([
    [5, "0.05EUR"],
    [100, "1.00EUR"],
    [1450, "14.50EUR"],
    [1405, "14.05EUR"],
    [123456, "1234.56EUR"],
  ])("%i Cent → %s", (cents, text) => {
    expect(formatPaypalAmount(cents)).toBe(text);
  });

  it("ohne offenen Betrag nur der Profil-Link", () => {
    expect(paypalMeLink("Angelverein", 0)).toBe("https://paypal.me/Angelverein");
  });

  it("ungültige Namen werden abgelehnt", () => {
    expect(isValidPaypalName("Angel Verein")).toBe(false);
    expect(isValidPaypalName("a/b")).toBe(false);
    expect(isValidPaypalName("")).toBe(false);
    expect(() => paypalMeLink("x/../evil", 100)).toThrow();
  });

  it("Kommazahlen werden abgelehnt", () => {
    expect(() => formatPaypalAmount(14.5)).toThrow();
  });
});
