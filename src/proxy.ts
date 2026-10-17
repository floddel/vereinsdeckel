import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import {
  authSecret,
  PIN_LOCK_COOKIE,
  PIN_UNLOCK_MINUTES,
  parseLockCookie,
  pinCookieName,
  pinCookieOptions,
  readPinCookie,
  signPinCookie,
} from "@/lib/pin";

/**
 * Türsteher vor Theke und Verwaltung (schnelle Vorprüfung anhand der Cookies).
 * Die echte Prüfung der Sitzung passiert zusätzlich auf jeder Seite und in jeder Aktion.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/") return NextResponse.redirect(new URL("/theke", request.url));

  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/verwaltung") && pathname !== "/verwaltung/entsperren") {
    const secret = authSecret();
    const now = Date.now();
    const lockedAt = parseLockCookie(request.cookies.get(PIN_LOCK_COOKIE)?.value);
    const name = pinCookieName(sessionCookie);
    const pin = readPinCookie(request.cookies.get(name)?.value, sessionCookie, secret, now, lockedAt);
    if (!pin) {
      const url = new URL("/verwaltung/entsperren", request.url);
      url.searchParams.set("next", pathname + search);
      return NextResponse.redirect(url);
    }
    // Aktivität verlängert die Freigabe (der Freigabe-Zeitpunkt bleibt gleich).
    const response = NextResponse.next();
    response.cookies.set(
      name,
      signPinCookie(sessionCookie, pin.unlockedAtMs, now + PIN_UNLOCK_MINUTES * 60_000, secret),
      pinCookieOptions(request.nextUrl.protocol === "https:"),
    );
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/theke/:path*", "/verwaltung/:path*"],
};
