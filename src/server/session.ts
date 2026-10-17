import { getSessionCookie } from "better-auth/cookies";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authSecret, PIN_LOCK_COOKIE, parseLockCookie, pinCookieName, verifyPinCookie } from "@/lib/pin";
import { getAuth } from "./auth";

/** Aktuelle Admin-Sitzung oder null. */
export async function getAdminSession() {
  return getAuth().api.getSession({ headers: await headers() });
}

/** Für Theke und Verwaltung: ohne Login → zur Anmeldung. */
export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) redirect("/login");
  return session;
}

/** Ist die Verwaltung per PIN entsperrt (für diese Login-Sitzung)? */
export async function isPinUnlocked(): Promise<boolean> {
  const sessionCookie = getSessionCookie(await headers());
  if (!sessionCookie) return false;
  const jar = await cookies();
  const lockedAt = parseLockCookie(jar.get(PIN_LOCK_COOKIE)?.value);
  return verifyPinCookie(jar.get(pinCookieName(sessionCookie))?.value, sessionCookie, authSecret(), Date.now(), lockedAt);
}

/**
 * Für alle Verwaltungsseiten und -aktionen: Login + PIN.
 * Wichtig: Jede Server-Aktion der Verwaltung muss das selbst aufrufen.
 */
export async function requireVerwaltung() {
  const session = await requireAdmin();
  if (!(await isPinUnlocked())) redirect("/verwaltung/entsperren");
  return session;
}
