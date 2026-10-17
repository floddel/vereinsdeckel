/**
 * Service Worker der Theke: Die Theke lädt auch ohne Internet.
 * - /theke:          erst Netz, ohne Internet die zuletzt geladene Fassung
 * - /_next/static/*: Programmdateien (Dateiname enthält Prüfsumme) → Zwischenspeicher zuerst
 * - alles andere (Verwaltung, Anmeldung, Schnittstellen): nie zwischenspeichern
 * Buchungen ohne Internet speichert die Theke selbst (IndexedDB), nicht dieser Service Worker.
 */
const VERSION = "v1";
const STATIC_CACHE = `vd-static-${VERSION}`;
const PAGE_CACHE = `vd-pages-${VERSION}`;
const OFFLINE_PAGE = "/theke";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => (k.startsWith("vd-") || k.startsWith("vh-")) && k !== STATIC_CACHE && k !== PAGE_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate" && url.pathname === OFFLINE_PAGE) {
    event.respondWith(networkFirstPage(request));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    // Nur eine echte Theke-Seite merken (keine Weiterleitung zur Anmeldung, keine Fehlerseite)
    if (response.ok && response.type === "basic" && !response.redirected) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(OFFLINE_PAGE, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(OFFLINE_PAGE, { cacheName: PAGE_CACHE });
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

// Beim Abmelden: gespeicherte Theke-Seite (mit Namen und Beträgen) löschen
self.addEventListener("message", (event) => {
  if (event.data === "clear-pages") event.waitUntil(caches.delete(PAGE_CACHE));
});
