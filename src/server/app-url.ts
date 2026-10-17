import { headers } from "next/headers";

/**
 * Öffentliche Adresse der App (für Mitglieder-Links und QR-Codes).
 * APP_URL setzen, sobald die App eine feste Adresse hat; sonst aus der Anfrage ermittelt.
 */
export async function getAppOrigin(): Promise<string> {
  const configured = configuredOrigin();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.|192\.168\.|10\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Fest eingestellte Adresse: APP_URL, sonst bei Vercel automatisch die Produktionsadresse – mit eigener
 * Domain, sobald eine eingetragen ist. null = keine (z. B. im Heimnetz: dann die Adresse der Anfrage).
 */
export function configuredOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const url = env.APP_URL?.trim();
  if (url) return url.replace(/\/$/, "");
  if (env.VERCEL_ENV === "production" && env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return null;
}

/** Adresse für den Login (Better Auth): BETTER_AUTH_URL, sonst wie oben. */
export function authOrigin(env: Record<string, string | undefined> = process.env): string | null {
  return env.BETTER_AUTH_URL?.trim().replace(/\/$/, "") || configuredOrigin(env);
}

/**
 * „Secure“-Cookies nur mit fester https-Adresse (Vercel, APP_URL/BETTER_AUTH_URL). Im Heimnetz über http
 * (NAS ohne Zertifikat) würde der Browser sie verwerfen – und niemand könnte sich anmelden.
 */
export function secureCookies(env: Record<string, string | undefined> = process.env): boolean {
  return (authOrigin(env) ?? "").startsWith("https://");
}

/** Woher die Adresse kommt (für den Einrichtungsassistenten). */
export function originSource(env: Record<string, string | undefined> = process.env): "fixed" | "vercel" | "request" {
  if (env.APP_URL?.trim()) return "fixed";
  return configuredOrigin(env) ? "vercel" : "request";
}

export function memberUrl(origin: string, token: string): string {
  return `${origin}/m/${token}`;
}
