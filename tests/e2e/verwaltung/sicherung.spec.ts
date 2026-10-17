import { expect, test } from "@playwright/test";
import { NO_AUTH } from "../fixtures";
import { openVerwaltung } from "../helpers";

test("Sichern: Datei herunterladen; Übernehmen nur in eine frische Installation", async ({ page, browser }) => {
  await openVerwaltung(page, "/verwaltung/sicherung");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Sicherung herunterladen" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^vereinsdeckel-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8")));
  expect(backup.format).toBe("vereinsdeckel-sicherung");
  expect(backup.tables.articles.length).toBeGreaterThan(0);
  expect(JSON.stringify(backup)).not.toContain("scrypt$"); // keine PIN

  // Hier gibt es schon Daten: Übernehmen ist gesperrt – auch direkt über die Schnittstelle
  await expect(page.getByTestId("sicherung-uebernehmen")).toContainText("Geht nur in eine frische Installation");
  const res = await page.request.post("/api/sicherung", {
    multipart: { art: "stammdaten", datei: { name: "s.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) } },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(409);

  // Ohne Anmeldung: weder herunterladen noch hochladen
  const anon = await browser.newContext({ storageState: NO_AUTH });
  expect((await anon.request.get("/api/sicherung")).status()).toBe(401);
  await anon.close();
});
