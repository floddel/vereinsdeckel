import { createHash, timingSafeEqual } from "node:crypto";

/** Mindestlänge, damit der Code nicht zu erraten ist. */
export const SETUP_CODE_MIN_LENGTH = 16;

export type SetupCodeState = "not-required" | "required" | "missing";

/**
 * Einrichtungs-Code (SETUP_CODE, nur in den Umgebungsvariablen, z. B. bei Vercel):
 * Ohne ihn kann niemand das erste Admin-Konto anlegen – auch nicht in den Minuten zwischen
 * Veröffentlichen und Einrichten. In Produktion ist er Pflicht, lokal nur, wenn gesetzt.
 */
export function setupCodeState(env: Record<string, string | undefined> = process.env): SetupCodeState {
  const code = env.SETUP_CODE?.trim();
  if (code && code.length >= SETUP_CODE_MIN_LENGTH) return "required";
  if (code || env.NODE_ENV === "production") return "missing";
  return "not-required";
}

const digest = (s: string) => createHash("sha256").update(s).digest();

/** Stimmt der eingegebene Code? (Vergleich in konstanter Zeit) */
export function setupCodeMatches(input: string, env: Record<string, string | undefined> = process.env): boolean {
  const state = setupCodeState(env);
  if (state === "not-required") return true;
  if (state === "missing") return false;
  return timingSafeEqual(digest(input.trim()), digest(env.SETUP_CODE!.trim()));
}
