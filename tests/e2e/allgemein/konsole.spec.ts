import { expect, test } from "@playwright/test";
import { isRealConsoleError, openVerwaltung } from "../helpers";

/**
 * Keine Fehler in der Browser-Konsole – z. B. wenn Server und Gerät Datum oder Beträge
 * unterschiedlich formatieren (React meldet dann „Hydration failed“).
 */
test("Theke und Verwaltung laden ohne Fehler in der Konsole", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && isRealConsoleError(m.text()) && errors.push(`${page.url()}: ${m.text()}`));
  page.on("pageerror", (e) => isRealConsoleError(e.message) && errors.push(`${page.url()}: ${e.message}`));

  await page.goto("/theke");
  await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toBeVisible();
  await page.waitForLoadState("networkidle");

  for (const path of ["/verwaltung", "/verwaltung/artikel", "/verwaltung/mitglieder", "/verwaltung/einstellungen"]) {
    await openVerwaltung(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});
