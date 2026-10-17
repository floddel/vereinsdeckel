/**
 * Datumsanzeige ohne Intl: Node (Server) und Safari formatieren deutsche Kurzdaten
 * unterschiedlich („Do., 15. Okt.“ vs. „Do. 15. Okt.“) – das stört React beim Laden.
 */
const WEEKDAYS = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
const MONTHS = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];

/** Geschäftstag "2026-10-15" → "Do., 15. Okt." */
export function formatBusinessDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]}, ${d}. ${MONTHS[m - 1]}`;
}

/** Geschäftstag "2026-10-10" → "Fr., 10.10.2026" */
export function formatBusinessDayNumeric(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${String(d).padStart(2, "0")}.${String(m).padStart(2, "0")}.${y}`;
}

const timeParts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Berlin" });

/** Uhrzeit in deutscher Zeit "19:42" (nur Ziffern aus Intl – auf allen Geräten gleich). */
export function formatTimeBerlin(iso: string): string {
  const parts = timeParts.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}
