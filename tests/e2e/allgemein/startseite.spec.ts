import { expect, test } from "@playwright/test";
import { NO_AUTH } from "../fixtures";

test.use({ storageState: NO_AUTH });

test("Anmeldeseite lädt ohne externe Quellen", async ({ page }) => {
  const externeAnfragen: string[] = [];
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.hostname !== "localhost") externeAnfragen.push(req.url());
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Anmelden").first()).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "de");

  // DSGVO: keine Schriften, Bilder oder Skripte von fremden Servern
  expect(externeAnfragen).toEqual([]);
});

test("ohne DEMO_MODE: kein Demo-Hinweis, Anmeldung nicht vorausgefüllt", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("E-Mail")).toHaveValue("");
  await expect(page.getByLabel("Passwort")).toHaveValue("");
  await expect(page.getByTestId("demo-hinweis")).toHaveCount(0);
  await expect(page.getByText("Demo")).toHaveCount(0);
});

test("kein waagerechtes Scrollen", async ({ page }) => {
  await page.goto("/login");
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
