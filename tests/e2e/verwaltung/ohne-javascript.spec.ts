import { expect, test } from "@playwright/test";
import { ADMIN } from "../fixtures";
import { openVerwaltung } from "../helpers";

test("bevor die Seite fertig geladen ist: Formulare senden nie Eingaben über die Adresszeile", async ({ page }) => {
  await openVerwaltung(page, "/verwaltung/einstellungen");

  // App-Skripte blockieren → Seite ist sichtbar, aber React wird nie aktiv (wie ein sehr langsames Tablet).
  await page.route("**/_next/static/chunks/**", (route) => route.abort());
  await page.goto("/verwaltung/einstellungen");
  await page.getByLabel("Aktuelle PIN").fill(ADMIN.pin);
  await page.getByLabel("Neue PIN", { exact: true }).fill(ADMIN.pin);
  await page.getByLabel("Neue PIN wiederholen").fill(ADMIN.pin);

  const request = page.waitForRequest((r) => r.url().includes("/verwaltung/einstellungen") && r.isNavigationRequest() && r.url() !== page.url() || r.method() === "POST");
  await page.getByRole("button", { name: "PIN ändern" }).click();
  const r = await request;
  expect(r.method()).toBe("POST");
  expect(r.url()).not.toContain(ADMIN.pin);
});
