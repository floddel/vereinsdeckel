/**
 * Demo-Betrieb für Vorführungen: nur mit DEMO_MODE=1 (genau dieser Wert), sonst immer aus.
 * Dann legt der Server beim Start Beispieldaten an (server/demo-data.ts), die Anmeldung ist
 * vorausgefüllt und jede Seite zeigt „Demo“. Ausgeschaltet ist, womit man sich aussperren könnte
 * (Passwort, PIN, zweiter Faktor) oder was Dateien und Schlüssel von außen annimmt.
 */
export function isDemo(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE === "1";
}

/** Zugang der Demo – steht auf der Anmeldeseite schon im Formular. */
export const DEMO_LOGIN = {
  name: "Vorstand",
  email: "demo@example.org",
  password: "vereinsdeckel",
  pin: "1234",
} as const;

/** Meldung für alles, was in der Demo ausgeschaltet ist. */
export const DEMO_DISABLED = "In der Demo ausgeschaltet";

/** Ende der Demo aus DEMO_ENDS_AT (ISO-Zeit, z. B. 2026-10-18T12:35:00Z) – oder null. */
export function demoEndsAt(env: Record<string, string | undefined> = process.env): Date | null {
  const raw = env.DEMO_ENDS_AT?.trim();
  if (!raw) return null;
  const at = new Date(raw);
  return Number.isNaN(at.getTime()) ? null : at;
}
