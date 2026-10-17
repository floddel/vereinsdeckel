import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Verwaltungs-PIN.
 * - Gespeichert wird nur ein scrypt-Hash (nicht umkehrbar), nie die PIN selbst.
 * - Nach richtiger Eingabe gibt es ein signiertes Cookie, das 15 Minuten gilt und an die
 *   aktuelle Login-Sitzung gebunden ist. Jede Aktivität in der Verwaltung verlängert es.
 */
export const PIN_COOKIE = "vd_pin";
export const PIN_UNLOCK_MINUTES = 15;
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 5;

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export function hashPin(pin: string): string {
  if (!isValidPin(pin)) throw new Error("PIN muss aus 4 bis 8 Ziffern bestehen");
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !isValidPin(pin)) return false;
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64url");
  const actual = scryptSync(pin, Buffer.from(saltB64, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

/**
 * Name des PIN-Cookies – je Login-Sitzung ein eigener ("vd_pin-<kürzel>").
 * Erneuert Better Auth die Anmeldung (zweiter Faktor an/aus), kann eine verspätete Antwort einer
 * vorgeladenen Seite mit der alten Anmeldung so nur das alte Cookie verlängern, nicht die
 * übertragene Freigabe der neuen überschreiben. Alte Cookies verfallen nach 15 Minuten.
 */
export function pinCookieName(sessionCookie: string): string {
  return `${PIN_COOKIE}-${createHash("sha256").update(sessionCookie).digest("hex").slice(0, 16)}`;
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Cookie-Wert "<freigabe>.<ablauf>.<signatur>", gebunden an das Login-Cookie.
 * Der Freigabe-Zeitpunkt bleibt beim Verlängern gleich – so kann eine verspätet
 * eintreffende Verlängerung eine spätere Sperre nicht aufheben (siehe PIN_LOCK_COOKIE).
 */
export function signPinCookie(sessionCookie: string, unlockedAtMs: number, expiresAtMs: number, secret: string): string {
  const payload = `${unlockedAtMs}.${expiresAtMs}`;
  return `${payload}.${sign(secret, `${payload}|${sessionCookie}`)}`;
}

/** Prüft das PIN-Cookie. Liefert den Freigabe-Zeitpunkt oder null. */
export function readPinCookie(
  value: string | undefined,
  sessionCookie: string | null | undefined,
  secret: string,
  nowMs: number,
  lockedAtMs = 0,
): { unlockedAtMs: number } | null {
  if (!value || !sessionCookie) return null;
  const [unlockedStr, expStr, sig] = value.split(".");
  const unlocked = Number(unlockedStr);
  const exp = Number(expStr);
  if (!Number.isSafeInteger(unlocked) || !Number.isSafeInteger(exp) || !sig) return null;
  if (exp <= nowMs || unlocked <= lockedAtMs) return null;
  const expected = Buffer.from(sign(secret, `${unlocked}.${exp}|${sessionCookie}`));
  const actual = Buffer.from(sig);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return { unlockedAtMs: unlocked };
}

export function verifyPinCookie(
  value: string | undefined,
  sessionCookie: string | null | undefined,
  secret: string,
  nowMs: number,
  lockedAtMs = 0,
): boolean {
  return readPinCookie(value, sessionCookie, secret, nowMs, lockedAtMs) !== null;
}

/**
 * „Verwaltung sperren“ merkt sich den Zeitpunkt. Jede PIN-Freigabe von davor ist ungültig,
 * auch wenn eine im Hintergrund vorgeladene Seite das PIN-Cookie noch einmal verlängert.
 * Muss länger leben als ein PIN-Cookie (15 Minuten).
 */
export const PIN_LOCK_COOKIE = "vd_pin_lock";

export function parseLockCookie(value: string | undefined): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : 0;
}

export function pinLockCookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "strict" as const, secure, path: "/", maxAge: 24 * 60 * 60 };
}

export function pinCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure,
    path: "/",
    maxAge: PIN_UNLOCK_MINUTES * 60,
  };
}

export function authSecret(): string {
  const s = process.env.BETTER_AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("BETTER_AUTH_SECRET fehlt oder ist zu kurz (siehe .env.example)");
  }
  return s;
}
