import { expect, test } from "@playwright/test";
import { NO_AUTH } from "../fixtures";
import { createMemberWithLink, openVerwaltung } from "../helpers";

test("Über Vereinsdeckel: Lizenz, Quellcode, Unterstützen – Fußzeile nur in der Verwaltung", async ({ page, browser }, testInfo) => {
  await openVerwaltung(page, "/verwaltung");
  const footer = page.getByTestId("vereinsdeckel-fusszeile");
  await expect(footer).toContainText("Vereinsdeckel – von floddel");
  await footer.getByRole("link").click();
  await expect(page).toHaveURL(/\/verwaltung\/ueber$/);

  await expect(page.getByTestId("lizenz")).toContainText("GNU Affero General Public License v3.0");
  await expect(page.getByTestId("lizenz")).toContainText("OHNE JEDE GEWÄHRLEISTUNG");
  await expect(page.getByTestId("quellcode").getByRole("link")).toHaveAttribute("href", "https://github.com/floddel/vereinsdeckel");
  const support = page.getByTestId("unterstuetzen");
  await expect(support.getByRole("link", { name: /GitHub Sponsors/ })).toHaveAttribute("href", "https://github.com/sponsors/floddel");
  await expect(support.getByRole("link", { name: /PayPal/ })).toHaveAttribute("href", "https://paypal.me/xygoht");
  await expect(support.getByRole("link", { name: /PayPal/ })).toHaveAttribute("rel", "noopener noreferrer");

  // Theke, Bierdeckel und Karte zeigen nichts davon
  const { url } = await createMemberWithLink(page, `Ohne Spendenhinweis ${testInfo.project.name}`);
  await page.goto("/theke");
  await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toBeVisible();
  await expect(page.getByText("Unterstützen")).toHaveCount(0);
  const guest = await browser.newContext({ storageState: NO_AUTH });
  const phone = await guest.newPage();
  for (const path of [url, "/karte"]) {
    await phone.goto(path);
    await expect(phone.getByRole("heading").first()).toBeVisible();
    await expect(phone.getByText(/Unterstützen|paypal\.me\/xygoht|Sponsors/)).toHaveCount(0);
  }
  await guest.close();
});
