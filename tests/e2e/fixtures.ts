/** Zugangsdaten nur für die automatischen Tests (eigene Test-Datenbank). */
export const ADMIN = {
  name: "Hauswart Test",
  email: "hauswart@example.org",
  password: "geheim-geheim-123",
  pin: "4711",
  /** gleich wie SETUP_CODE in playwright.config.ts */
  setupCode: "einrichtungs-code-nur-fuer-tests",
};

export const AUTH_FILE = ".data/e2e-auth.json";

/** Für Tests, die ohne Anmeldung starten sollen. */
export const NO_AUTH = { cookies: [], origins: [] };
