import { getSessionCookie } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import { authOrigin } from "./app-url";
import {
  authSecret,
  parseLockCookie,
  PIN_LOCK_COOKIE,
  PIN_UNLOCK_MINUTES,
  pinCookieName,
  pinCookieOptions,
  readPinCookie,
  signPinCookie,
} from "@/lib/pin";

/** Läuft die Seite über HTTPS? (für die Cookie-Einstellung „secure“) */
export async function isSecureRequest(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? new URL(authOrigin() ?? "http://x").protocol.replace(":", "");
  return proto === "https";
}

/** Login-Cookie dieser Anfrage – vor einer Aktion merken, die die Anmeldung erneuert. */
export async function currentSessionCookie(): Promise<string | null> {
  return getSessionCookie(await headers()) ?? null;
}

/**
 * Better Auth erneuert beim Ein-/Ausschalten des zweiten Faktors die Anmeldung (neues Login-Cookie).
 * Die PIN-Freigabe hängt am Login-Cookie – sie wird hier auf das neue übertragen,
 * damit die Verwaltung entsperrt bleibt. Ohne gültige Freigabe passiert nichts.
 */
export async function carryPinUnlock(before: string | null): Promise<void> {
  if (!before) return;
  const jar = await cookies();
  const now = Date.now();
  const unlock = readPinCookie(jar.get(pinCookieName(before))?.value, before, authSecret(), now, parseLockCookie(jar.get(PIN_LOCK_COOKIE)?.value));
  if (!unlock) return;
  const after = getSessionCookie(new Headers({ cookie: jar.toString() }));
  if (!after || after === before) return;
  jar.set(
    pinCookieName(after),
    signPinCookie(after, unlock.unlockedAtMs, now + PIN_UNLOCK_MINUTES * 60_000, authSecret()),
    pinCookieOptions(await isSecureRequest()),
  );
}

/** Direkt nach der Ersteinrichtung: Die PIN wurde gerade gewählt – Verwaltung gleich entsperren. */
export async function unlockPinForNewSession(): Promise<void> {
  const jar = await cookies();
  const session = getSessionCookie(new Headers({ cookie: jar.toString() }));
  if (!session) return;
  const now = Date.now();
  jar.set(pinCookieName(session), signPinCookie(session, now, now + PIN_UNLOCK_MINUTES * 60_000, authSecret()), pinCookieOptions(await isSecureRequest()));
}
