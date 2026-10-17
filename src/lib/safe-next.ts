const BASE = "http://intern.invalid";

/**
 * Nur interne Pfade als Weiterleitungsziel zulassen (kein "//fremde-seite.de").
 * Steuer- und Leerzeichen sind verboten: Browser entfernen z. B. Tabs, dann würde aus
 * "/\t/fremde-seite.de" wieder "//fremde-seite.de". Zusätzlich wird das Ziel wie im Browser
 * ausgewertet und muss auch danach noch ein Pfad auf derselben Seite sein.
 */
export function safeNextPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  if (/[\u0000-\u001F\u007F\s]/.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return fallback;
  }
  if (url.origin !== BASE) return fallback;
  // Nach dem Auswerten nochmal prüfen: aus "/.//fremd.de" oder "/%2e%2e//fremd.de" wird "//fremd.de".
  const path = url.pathname + url.search + url.hash;
  if (path.startsWith("//") || path.includes("\\")) return fallback;
  return path;
}
