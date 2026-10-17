import localFont from "next/font/local";

// Alle Schriften liegen als Dateien im Projekt (keine externen Schriftquellen, DSGVO).
// Lizenzen: siehe LICENSE-*.txt in diesem Ordner (SIL Open Font License 1.1).
// Alle Schriften für Zahlen haben eine normale Null (ohne Strich oder Punkt) – Ausnahme: fontMono.

// Text und Überschriften nutzen die Systemschrift des Geräts (siehe globals.css) – nichts zu laden.

/** Monospace für Links und Rohdaten (die Null hat einen Punkt – nicht für Beträge verwenden). */
export const fontMono = localFont({
  src: [
    { path: "./jetbrains-mono-latin-400-normal.woff2", weight: "400" },
    { path: "./jetbrains-mono-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-app-mono",
  display: "swap",
});

/** Bierdeckel (Mitgliederansicht): wie mit dem Filzstift, aber gut lesbar. Nur dort laden. */
export const fontCoaster = localFont({
  src: "./shantell-sans-latin-wght-normal.woff2",
  weight: "300 800",
  variable: "--font-app-coaster",
  display: "swap",
});

/** Kassenzettel (Mitgliederansicht): wie ein echter Bon. Nur dort laden. */
export const fontReceipt = localFont({
  src: [
    { path: "./courier-prime-latin-400-normal.woff2", weight: "400" },
    { path: "./courier-prime-latin-700-normal.woff2", weight: "700" },
  ],
  variable: "--font-app-receipt",
  display: "swap",
});
