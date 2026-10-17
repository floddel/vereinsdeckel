import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Verschlüsselt kleine Geheimnisse (z. B. den API-Schlüssel für die Bon-Erkennung) für die Datenbank.
 * AES-256-GCM; der Schlüssel wird aus BETTER_AUTH_SECRET abgeleitet (liegt nur in .env.local bzw. bei Vercel).
 * Wer nur die Datenbank hat, kann den API-Schlüssel nicht lesen.
 * Achtung: Wird BETTER_AUTH_SECRET geändert, muss der API-Schlüssel neu eingegeben werden.
 */
const VERSION = "v1";

function key(secret: string, purpose: string): Buffer {
  // Fester Wert – NICHT ändern, sonst lassen sich
  // gespeicherte Schlüssel nicht mehr entschlüsseln.
  return Buffer.from(hkdfSync("sha256", secret, "vereinsheim", purpose, 32));
}

export function seal(plain: string, secret: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(secret, purpose), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** null, wenn verändert, mit anderem Geheimnis verschlüsselt oder kaputt. */
export function open(sealed: string, secret: string, purpose: string): string | null {
  const [version, iv, tag, data] = sealed.split(".");
  if (version !== VERSION || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(secret, purpose), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
