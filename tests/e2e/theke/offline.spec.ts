import { expect, type Page, test } from "@playwright/test";

/** Eigene Mitglieder je Gerät (gemeinsame Test-Datenbank). */
const mitglied = (project: string) =>
  ({ "tablet-quer": "Horst Müller", "tablet-hoch": "Horst Schmidt", desktop: "Manfred Müller" })[project] ?? "Horst Becker";

const memberButton = (page: Page, name: string) =>
  page.getByRole("main").getByRole("button", { name: new RegExp(`^${name}`) }).first();

async function openMember(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Mitglied suchen" }).fill(name);
  await memberButton(page, name).click();
}

test("Ungesendete Buchung übersteht Neuladen und wird genau einmal gespeichert", async ({ page }, testInfo) => {
  const name = mitglied(testInfo.project.name);
  await page.goto("/theke");
  await openMember(page, name);
  await expect(page.getByTestId("theke-open")).toHaveText("0,00 €");

  // Server für das Tablet nicht erreichbar (z. B. WLAN im Vereinsheim weg)
  await page.route("**/api/sync", (route) => route.abort("internetdisconnected"));
  await page.getByRole("button", { name: /^Cola,/ }).click();
  await page.getByRole("button", { name: /^Anschreiben/ }).click();
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "offline");

  // Seite neu laden (oder Tablet neu gestartet): Buchung ist noch da
  await page.reload();
  await openMember(page, name);
  await expect(page.getByTestId("theke-open")).toHaveText("1,50 €");
  await expect(page.getByTestId("bon").first()).toContainText("wird gespeichert");

  // Verbindung wieder da → automatisch gesendet
  await page.unroute("**/api/sync");
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "ok", { timeout: 20_000 });
  await page.reload();
  await openMember(page, name);
  await expect(page.getByTestId("theke-open")).toHaveText("1,50 €");
  await expect(page.getByTestId("bon")).toHaveCount(1);
});

test.describe("mit Service Worker", () => {
  test.use({ serviceWorkers: "allow" });

  test("Ohne Internet: Theke lädt aus dem Zwischenspeicher und bucht", async ({ page, context, browserName }, testInfo) => {
    test.skip(browserName !== "chromium", "Service Worker im Test nur mit Chromium");
    const name = testInfo.project.name === "desktop" ? "Manfred Schmidt" : "Zita Ostermann";
    await page.goto("/theke");
    await page.evaluate(() => navigator.serviceWorker.ready);
    // zweites Laden läuft über den Service Worker und legt die Seite für später ab
    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toBeVisible();
    await openMember(page, name);
    await page.getByRole("button", { name: /^Wasser,/ }).click();
    await page.getByRole("button", { name: /^Anschreiben/ }).click();
    await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "offline");
    await openMember(page, name);
    await expect(page.getByTestId("theke-open")).toHaveText("1,00 €");

    await context.setOffline(false);
    await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "ok", { timeout: 20_000 });
    await page.reload();
    await openMember(page, name);
    await expect(page.getByTestId("theke-open")).toHaveText("1,00 €");
  });
});
