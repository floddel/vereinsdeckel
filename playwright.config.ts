import { defineConfig, devices } from "@playwright/test";
import { AUTH_FILE, NO_AUTH } from "./tests/e2e/fixtures";

const PORT = 3100;
/** Zweiter Server derselben App im Demo-Betrieb (DEMO_MODE=1) */
const DEMO_PORT = 3101;

/**
 * Ende-zu-Ende-Tests in echten Browsern.
 * - tests/e2e/setup:     einmalige Ersteinrichtung (Admin-Konto), danach sind alle angemeldet
 * - tests/e2e/theke, verwaltung: Tablet (quer + hoch) und Desktop
 * - tests/e2e/mitglied:  Smartphones (iPhone, Android mit 360 px Breite)
 * - tests/e2e/allgemein: alle Geräte
 * - tests/e2e/demo:      Demo-Betrieb auf eigenem Server (Desktop)
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    trace: "retain-on-failure",
    storageState: AUTH_FILE,
    // Service Worker nur im Offline-Test (sonst kann Playwright Anfragen in Safari nicht abfangen)
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "setup",
      testMatch: /setup\/.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: NO_AUTH },
    },
    {
      name: "tablet-quer",
      testMatch: /(theke|verwaltung|allgemein)\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["iPad (gen 11) landscape"] },
    },
    {
      name: "tablet-hoch",
      testMatch: /(theke|verwaltung|allgemein)\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["iPad (gen 11)"] },
    },
    {
      name: "desktop",
      testMatch: /(theke|verwaltung|allgemein)\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Bilder für die Dokumentation (nur mit DOKU_BILDER=1, siehe npm run docs:bilder)
      name: "doku",
      testMatch: /doku\/.*\.spec\.ts/,
      dependencies: ["setup"],
      // DOKU_DUNKEL=1: dieselben Bilder im Dunkelmodus (zum Prüfen)
      use: { ...devices["Desktop Chrome"], colorScheme: process.env.DOKU_DUNKEL ? "dark" : "light" },
    },
    {
      name: "demo",
      testMatch: /demo\/.*\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${DEMO_PORT}`, storageState: NO_AUTH },
    },
    {
      name: "iphone",
      testMatch: /(mitglied|allgemein)\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["iPhone 15"] },
    },
    {
      name: "android",
      testMatch: /(mitglied|allgemein)\/.*\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Galaxy S24"] },
    },
  ],
  webServer: [
    {
      // Schein-Anthropic für die Kassenbon-Erkennung (nichts geht ins Internet).
      // Antwortet ohne Schlüssel mit 401 – das zählt für Playwright als „bereit“.
      command: "node tests/e2e/mock-anthropic.mjs",
      url: "http://localhost:3199/health",
      reuseExistingServer: false,
    },
    {
      // Produktions-Build mit eigener, leerer Test-Datenbank.
      command: `rm -rf .data/e2e .data/e2e-auth.json && npm run build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: {
        PGLITE_DIR: ".data/e2e",
        SEED_EXAMPLES: "1",
        // 56 Beispielmitglieder, damit die Theke wie an einem vollen Abend aussieht
        SEED_EXAMPLE_MEMBERS: "1",
        BETTER_AUTH_URL: `http://localhost:${PORT}`,
        BETTER_AUTH_SECRET: "nur-fuer-tests-nur-fuer-tests-nur-fuer-tests",
        SETUP_CODE: "einrichtungs-code-nur-fuer-tests",
        // Kassenbon-Erkennung gegen den Schein-Anthropic
        ANTHROPIC_BASE_URL: "http://localhost:3199",
      },
    },
    {
      // Derselbe Build im Demo-Betrieb mit eigener Datenbank (startet erst, wenn der erste Server läuft)
      command: `rm -rf .data/e2e-demo && npx next start -p ${DEMO_PORT}`,
      url: `http://localhost:${DEMO_PORT}`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        PGLITE_DIR: ".data/e2e-demo",
        DEMO_MODE: "1",
        DEMO_ENDS_AT: "2030-01-01T13:35:00Z", // 14:35 Uhr in Berlin
        BETTER_AUTH_URL: `http://localhost:${DEMO_PORT}`,
        BETTER_AUTH_SECRET: "nur-fuer-tests-nur-fuer-tests-nur-fuer-tests",
      },
    },
  ],
});
