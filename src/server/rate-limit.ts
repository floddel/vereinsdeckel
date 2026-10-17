/**
 * Einfache Bremse gegen zu viele Anfragen (z. B. PDFs über den Mitgliederlink).
 * Zählt im Arbeitsspeicher je Schlüssel in festen Zeitfenstern – speichert nichts dauerhaft
 * und keine IP-Adressen. Laufen mehrere Server-Instanzen, zählt jede für sich.
 */
const MAX_KEYS = 5000;

interface Window {
  start: number;
  count: number;
}

const globalForLimit = globalThis as unknown as { __vereinsdeckelRateLimit?: Map<string, Window> };

function windows(): Map<string, Window> {
  globalForLimit.__vereinsdeckelRateLimit ??= new Map();
  return globalForLimit.__vereinsdeckelRateLimit;
}

export type LimitResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Zählt eine Anfrage für `key`; mehr als `max` im Zeitfenster `windowMs` → abgelehnt. */
export function hit(key: string, max: number, windowMs: number, nowMs = Date.now()): LimitResult {
  const map = windows();
  let w = map.get(key);
  if (!w || nowMs - w.start >= windowMs) {
    if (map.size >= MAX_KEYS) prune(map, nowMs, windowMs);
    w = { start: nowMs, count: 0 };
    map.set(key, w);
  }
  if (w.count >= max) return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((w.start + windowMs - nowMs) / 1000)) };
  w.count++;
  return { ok: true };
}

/** Abgelaufene Fenster entfernen; reicht das nicht, die ältesten (Speicher bleibt begrenzt). */
function prune(map: Map<string, Window>, nowMs: number, windowMs: number) {
  for (const [k, w] of map) if (nowMs - w.start >= windowMs) map.delete(k);
  for (const k of map.keys()) {
    if (map.size < MAX_KEYS) break;
    map.delete(k);
  }
}

/** Nur für Tests. */
export function resetRateLimits() {
  windows().clear();
}

export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response("Zu viele Anfragen – bitte kurz warten und noch einmal versuchen.", {
    status: 429,
    headers: { "Retry-After": String(retryAfterSeconds), "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
