/**
 * Persönlicher Mitglieder-Link: 32 Byte Zufall (256 Bit), Base64url → 43 Zeichen.
 * Nicht erratbar; erlaubt nur Lesezugriff auf das eigene Konto.
 */
export function generateMemberToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

/** Grobe Formatprüfung, bevor überhaupt in der Datenbank gesucht wird. */
export function looksLikeMemberToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}
