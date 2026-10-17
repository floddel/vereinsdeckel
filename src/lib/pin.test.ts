import { describe, expect, it } from "vitest";
import {
  hashPin,
  PIN_LOCK_COOKIE,
  pinCookieName,
  isValidPin,
  readPinCookie,
  signPinCookie,
  verifyPin,
  verifyPinCookie,
} from "./pin";

const secret = "x".repeat(40);

describe("PIN", () => {
  it("4 bis 8 Ziffern", () => {
    expect(isValidPin("1234")).toBe(true);
    expect(isValidPin("12345678")).toBe(true);
    expect(isValidPin("123")).toBe(false);
    expect(isValidPin("12a4")).toBe(false);
    expect(isValidPin("123456789")).toBe(false);
  });

  it("Hash prüft die richtige PIN und lehnt falsche ab", () => {
    const stored = hashPin("4711");
    expect(stored).not.toContain("4711");
    expect(verifyPin("4711", stored)).toBe(true);
    expect(verifyPin("4712", stored)).toBe(false);
    expect(verifyPin("4711", null)).toBe(false);
    expect(verifyPin("4711", "kaputt")).toBe(false);
  });

  it("gleiche PIN ergibt jedes Mal einen anderen Hash (Salz)", () => {
    expect(hashPin("1234")).not.toBe(hashPin("1234"));
  });
});

describe("PIN-Freigabe-Cookie", () => {
  const now = 1_000_000;
  const cookie = signPinCookie("sitzung-a", now - 1_000, now + 60_000, secret);

  it("gültig bis zum Ablauf", () => {
    expect(verifyPinCookie(cookie, "sitzung-a", secret, now)).toBe(true);
    expect(verifyPinCookie(cookie, "sitzung-a", secret, now + 60_000)).toBe(false);
  });

  it("gilt nur für dieselbe Login-Sitzung", () => {
    expect(verifyPinCookie(cookie, "sitzung-b", secret, now)).toBe(false);
    expect(verifyPinCookie(cookie, null, secret, now)).toBe(false);
  });

  it("gefälschte oder veränderte Cookies werden abgelehnt", () => {
    const [unlocked, , sig] = cookie.split(".");
    expect(verifyPinCookie(`${unlocked}.${now + 999_999}.${sig}`, "sitzung-a", secret, now)).toBe(false);
    expect(verifyPinCookie(`${now}.${now + 60_000}.${sig}`, "sitzung-a", secret, now)).toBe(false);
    expect(verifyPinCookie(cookie, "sitzung-a", "y".repeat(40), now)).toBe(false);
    expect(verifyPinCookie("unsinn", "sitzung-a", secret, now)).toBe(false);
    expect(verifyPinCookie(undefined, "sitzung-a", secret, now)).toBe(false);
  });

  it("nach „Verwaltung sperren“ gilt keine ältere Freigabe mehr – auch nicht verlängert", () => {
    const lockedAt = now;
    expect(verifyPinCookie(cookie, "sitzung-a", secret, now, lockedAt)).toBe(false);
    // Eine vorgeladene Seite verlängert das alte Cookie nach der Sperre:
    const refreshed = signPinCookie("sitzung-a", now - 1_000, now + 900_000, secret);
    expect(verifyPinCookie(refreshed, "sitzung-a", secret, now + 10, lockedAt)).toBe(false);
    // Neue PIN-Eingabe nach der Sperre gilt wieder:
    const fresh = signPinCookie("sitzung-a", now + 5, now + 900_000, secret);
    expect(readPinCookie(fresh, "sitzung-a", secret, now + 10, lockedAt)).toEqual({ unlockedAtMs: now + 5 });
  });

  it("PIN-Cookie heißt je Anmeldung anders", () => {
    expect(pinCookieName("a.sig")).toMatch(/^vd_pin-[0-9a-f]{16}$/);
    expect(pinCookieName("a.sig")).toBe(pinCookieName("a.sig"));
    expect(pinCookieName("a.sig")).not.toBe(pinCookieName("b.sig"));
    expect(pinCookieName("a.sig")).not.toBe(PIN_LOCK_COOKIE);
  });
});
