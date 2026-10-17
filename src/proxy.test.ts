import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PIN_UNLOCK_MINUTES, pinCookieName, signPinCookie } from "@/lib/pin";
import { proxy } from "./proxy";

const secret = "x".repeat(40);
const pinFor = (session: string) => {
  const now = Date.now();
  return `${pinCookieName(session)}=${signPinCookie(session, now - 60_000, now + PIN_UNLOCK_MINUTES * 60_000, secret)}`;
};
const request = (path: string, cookie: string) => new NextRequest(`http://localhost:3000${path}`, { headers: { cookie } });

describe("proxy: PIN-Freigabe", () => {
  beforeEach(() => vi.stubEnv("BETTER_AUTH_SECRET", secret));
  afterEach(() => vi.unstubAllEnvs());

  it("Aufruf der Verwaltung verlängert die Freigabe dieser Anmeldung", () => {
    const res = proxy(request("/verwaltung/einstellungen", `better-auth.session_token=neu; ${pinFor("neu")}`));
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get(pinCookieName("neu"))).toBeDefined();
  });

  it("verspätete Anfrage mit der alten Anmeldung berührt die Freigabe der neuen nicht", () => {
    // z. B. vorgeladene Seite, losgeschickt bevor der zweite Faktor ausgeschaltet wurde
    const res = proxy(request("/verwaltung/einkaeufe", `better-auth.session_token=alt; ${pinFor("alt")}`));
    expect(res.cookies.get(pinCookieName("alt"))).toBeDefined();
    expect(res.cookies.get(pinCookieName("neu"))).toBeUndefined();
  });

  it("Freigabe einer anderen Anmeldung zählt nicht", () => {
    const res = proxy(request("/verwaltung/kasse", `better-auth.session_token=neu; ${pinFor("alt")}`));
    expect(res.headers.get("location")).toContain("/verwaltung/entsperren");
  });
});
