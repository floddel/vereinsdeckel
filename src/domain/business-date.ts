/**
 * Geschäftstag ("Abend"): Alles bis zur Uhrzeit `cutoffHour` am Folgetag gehört noch zum Vorabend.
 * Beispiel (Wechsel 06:00): Buchung am 15.10. um 01:30 Uhr → Abend vom 14.10.
 * Gerechnet wird immer in deutscher Zeit (Europe/Berlin), inkl. Sommer-/Winterzeit.
 */
export const CLUB_TIME_ZONE = "Europe/Berlin";

const pad = (n: number) => String(n).padStart(2, "0");

/** Liefert den Geschäftstag als "JJJJ-MM-TT". */
export function businessDate(at: Date, cutoffHour = 6, timeZone = CLUB_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);

  let year = get("year");
  let month = get("month");
  let day = get("day");
  if (get("hour") < cutoffHour) {
    const prev = new Date(Date.UTC(year, month - 1, day - 1));
    year = prev.getUTCFullYear();
    month = prev.getUTCMonth() + 1;
    day = prev.getUTCDate();
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}
