import { expect, type Page, test } from "@playwright/test";

/** Demo-Betrieb: eigener Server mit DEMO_MODE=1 und frischer Datenbank (siehe playwright.config.ts). */

async function anmelden(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/theke/);
}

test("Demo: Zugang ist eingetragen, ein Klick führt zur Theke des Beispielvereins", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByTestId("demo-hinweis")).toHaveText("Demo bis 14:35");
  await expect(page.getByText("Das ist eine Demo mit erfundenen Daten.")).toBeVisible();
  await expect(page.getByLabel("E-Mail")).toHaveValue("demo@example.org");

  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/theke/);
  await expect(page.getByRole("button", { name: /Heinz Zimmermann/ }).first()).toBeVisible();
  await expect(page.getByTestId("demo-hinweis")).toBeVisible();
});

test("Demo: Verwaltung mit eingetragener PIN, Sperren greifen", async ({ page }) => {
  await anmelden(page);
  await page.goto("/verwaltung/einstellungen");
  await expect(page).toHaveURL(/entsperren/);
  await expect(page.getByLabel("PIN")).toHaveValue("1234");
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page).toHaveURL(/\/verwaltung\/einstellungen/);
  await expect(page.getByText("In der Demo ausgeschaltet: Passwort")).toBeVisible();

  // PIN ändern geht in der Demo nicht – sonst sperrt man sich aus
  await page.getByLabel("Aktuelle PIN").fill("1234");
  await page.getByLabel("Neue PIN", { exact: true }).fill("9999");
  await page.getByLabel("Neue PIN wiederholen").fill("9999");
  await page.getByRole("button", { name: "PIN ändern" }).click();
  await expect(page.getByText("In der Demo ausgeschaltet", { exact: true })).toBeVisible();

  await page.goto("/verwaltung/abende");
  await expect(page.getByText("Heimspiel gegen SV Nachbardorf")).toBeVisible();
});
