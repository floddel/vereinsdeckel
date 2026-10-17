import { expect, test as setup } from "@playwright/test";
import { ADMIN, AUTH_FILE } from "../fixtures";

setup("Ersteinrichtung: Admin-Konto und PIN anlegen", async ({ page }) => {
  await page.goto("/");
  // Ohne Konto führt jeder Weg zur Einrichtung.
  await expect(page).toHaveURL(/\/einrichten/);

  // Ohne den richtigen Einrichtungs-Code geht nichts
  await page.getByLabel("Einrichtungs-Code").fill("falscher-code-falscher-code");
  await page.getByLabel("Dein Name").fill(ADMIN.name);
  await page.getByLabel("E-Mail").fill(ADMIN.email);
  await page.getByLabel("Passwort", { exact: true }).fill(ADMIN.password);
  await page.getByLabel("Passwort wiederholen").fill(ADMIN.password);
  await page.getByLabel("Verwaltungs-PIN").fill(ADMIN.pin);
  await page.getByLabel("PIN wiederholen").fill(ADMIN.pin);
  await page.getByRole("button", { name: "Konto anlegen" }).click();
  await expect(page.getByText("Einrichtungs-Code stimmt nicht")).toBeVisible();
  await expect(page).toHaveURL(/\/einrichten/);

  await page.getByLabel("Einrichtungs-Code").fill(ADMIN.setupCode);
  await page.getByLabel("Passwort", { exact: true }).fill(ADMIN.password);
  await page.getByLabel("Passwort wiederholen").fill(ADMIN.password);
  await page.getByLabel("Verwaltungs-PIN").fill(ADMIN.pin);
  await page.getByLabel("PIN wiederholen").fill(ADMIN.pin);
  await page.getByRole("button", { name: "Konto anlegen" }).click();

  // Weiter im Einrichtungsassistenten – ohne nochmal nach der PIN zu fragen
  await expect(page).toHaveURL(/\/verwaltung\/einrichtung/);
  await expect(page.getByRole("navigation", { name: "Schritte der Einrichtung" })).toBeVisible();
  await page.goto("/theke");
  await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toBeVisible();
  // Nur die Anmeldung weitergeben, nicht die PIN-Freigabe der Einrichtung (Tests erwarten eine gesperrte Verwaltung)
  await page.context().clearCookies({ name: /^vd_pin-/ });
  await page.context().storageState({ path: AUTH_FILE });
});
