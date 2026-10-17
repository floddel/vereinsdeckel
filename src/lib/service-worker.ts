"use client";

import { clearSnapshot } from "./offline-store";

/**
 * Service Worker anmelden (nur im fertigen Build: im Entwicklungsmodus würden zwischengespeicherte
 * Programmdateien das automatische Neuladen stören – dort werden alte Service Worker entfernt).
 * Browser erlauben Service Worker nur über https oder auf localhost.
 */
export function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV === "production") {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  } else {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  }
}

/** Beim Abmelden: zwischengespeicherte Theke-Seite und Stand löschen (ungesendete Buchungen bleiben). */
export function clearOfflineData() {
  navigator.serviceWorker?.controller?.postMessage("clear-pages");
  void clearSnapshot();
}
