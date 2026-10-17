/**
 * Ist das nur eine Test-Adresse (eigener Rechner, Heimnetz, ohne https)?
 * Dann taugen QR-Codes nicht zum Drucken: Die Mitglieder erreichen die Adresse später nicht.
 */
export function isTestOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return true;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:") return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.startsWith("[")) return true; // IPv6-Adresse
  const ip = host.split(".").map(Number);
  if (ip.length === 4 && ip.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) return true; // IPv4-Adresse
  return false;
}
