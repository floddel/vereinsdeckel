/**
 * Kommt die Anfrage von der eigenen Seite? Schützt Änderungen davor, dass eine fremde Webseite
 * sie im Namen des Geräts auslöst (der Browser setzt den Origin-Kopf selbst).
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return !!origin && !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}
