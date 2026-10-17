import { expect, test } from "@playwright/test";
import { openVerwaltung, shot } from "../helpers";

// kleines, gültiges PNG (2×2 Pixel) als „Belegfoto“
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64",
);

test("Einkauf mit Belegfoto erfassen, ansehen und stornieren", async ({ page, browser }, testInfo) => {
  const note = `Metro ${testInfo.project.name}`;
  await openVerwaltung(page, "/verwaltung/einkaeufe");
  await page.getByRole("button", { name: "Einkauf erfassen" }).click();
  await expect(page.getByRole("heading", { name: "Einkauf erfassen" })).toBeVisible();

  // ohne Stückzahl → Hinweis
  await page.getByLabel("Artikel").first().selectOption({ label: "Pils 0,33" });
  await page.getByRole("button", { name: /^Einkauf speichern/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Position 1" })).toHaveText("Position 1: Bitte die Stückzahl eingeben");

  // Position 1: Kiste Pils
  const first = page.getByRole("group", { name: "Position 1" });
  await first.getByLabel("Stück").fill("24");
  await expect(page.getByText("Position 1: Bitte die Stückzahl eingeben")).toBeHidden();
  await first.getByLabel("Preis gesamt (€)").fill("14,99");
  await expect(first.getByTestId("stueckpreis")).toHaveText("je Stück 0,62 € · Vereinspreis 2,00 € (1,38 € mehr)");

  // Position 2: ohne Artikel
  await page.getByRole("button", { name: "Weitere Position" }).click();
  const second = page.getByRole("group", { name: "Position 2" });
  await second.getByLabel("Beschreibung Position 2").fill("Grillkohle");
  await second.getByLabel("Stück").fill("1");
  await second.getByLabel("Preis gesamt (€)").fill("4,99");

  await page.getByLabel("Bezahlt aus").selectOption("private");
  await expect(page.getByText("Selbst ausgelegt – wird als Auslage vermerkt")).toBeVisible();
  await page.getByLabel("Belegfoto").setInputFiles({ name: "beleg.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByRole("img", { name: "Vorschau des Belegs" })).toBeVisible();
  await page.getByLabel("Notiz (optional)").fill(note);
  await shot(page, "einkauf-erfassen", testInfo.project.name);
  await page.getByRole("button", { name: "Einkauf speichern · 19,98 €" }).click();

  // Liste
  await expect(page).toHaveURL(/\/verwaltung\/einkaeufe$/);
  const entry = page.getByRole("link").filter({ hasText: note });
  await expect(entry).toContainText("Privat vorgestreckt");
  await expect(entry).toContainText("24× Pils 0,33, 1× Grillkohle");
  await expect(entry).toContainText("19,98 €");
  await shot(page, "einkaeufe", testInfo.project.name);

  // Einzelansicht mit Beleg
  await entry.click();
  await expect(page.getByRole("heading", { name: /^Einkauf vom/ })).toBeVisible();
  const img = page.getByRole("img", { name: "Beleg" });
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

  // Beleg wird nicht im Browser aufgehoben; ohne Anmeldung nicht abrufbar
  const src = await img.getAttribute("src");
  expect((await page.request.get(src!)).headers()["cache-control"]).toBe("private, no-store");
  const anon = await browser.newContext({ baseURL: "http://localhost:3100" });
  expect((await anon.request.get(src!)).status()).toBe(401);
  await anon.close();

  // Storno mit Begründung
  await page.getByRole("button", { name: "Stornieren" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Stornieren" })).toBeDisabled();
  await dialog.getByLabel("Begründung").fill("doppelt erfasst");
  await dialog.getByRole("button", { name: "Stornieren" }).click();
  await expect(page.getByText("storniert: doppelt erfasst")).toBeVisible();
  await expect(page.getByRole("button", { name: "Stornieren" })).toBeHidden();
});

test("Einkauf mit Ausschank-Flaschen, Kisten und nur der Bon-Summe", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const jack = `Jack ${p}`;
  const helles = `Helles Kiste ${p}`;
  await openVerwaltung(page, "/verwaltung/artikel");
  const dialog = page.getByRole("dialog");
  // Jack: 4 cl aus 0,7 l für 3,00 €
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  await dialog.getByLabel("Name").fill(jack);
  await dialog.getByLabel("Vereinspreis (€)").fill("3");
  await dialog.getByRole("radio", { name: /^Ausschank/ }).click();
  await dialog.getByLabel("Portion", { exact: true }).fill("4 cl");
  await dialog.getByLabel("Übliche Flaschengröße", { exact: true }).fill("0,7 l");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  // Helles: Kiste 20
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  await dialog.getByLabel("Name").fill(helles);
  await dialog.getByLabel("Vereinspreis (€)").fill("2");
  await dialog.getByLabel("Stück je Kiste (optional)").fill("20");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/verwaltung/einkaeufe/neu");
  const first = page.getByRole("group", { name: "Position 1" });
  await first.getByLabel("Artikel").selectOption({ label: jack });
  await expect(first.getByLabel("Größe je Flasche")).toHaveValue("0,7 l"); // übliche Größe vorgeschlagen
  await first.getByLabel("Flaschen").fill("2");
  await first.getByLabel("Preis gesamt (€)").fill("42");
  await expect(first.getByTestId("menge")).toHaveText("= 1,4 l ≈ 35 × 4 cl");
  await expect(first.getByTestId("stueckpreis")).toHaveText("je 4 cl 1,20 € · Vereinspreis 3,00 € (1,80 € mehr)");

  await page.getByRole("button", { name: "Weitere Position" }).click();
  const second = page.getByRole("group", { name: "Position 2" });
  await second.getByLabel("Artikel").selectOption({ label: helles });
  await second.getByLabel("Kisten à 20").fill("3");
  await second.getByLabel("Einzeln").fill("4");
  await expect(second.getByTestId("menge")).toHaveText("= 64 Stück");

  // ohne Preis bei Position 2 und ohne Bon-Summe → Hinweis
  await page.getByRole("button", { name: /^Einkauf speichern/ }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Summe laut Bon" })).toBeVisible();
  await page.getByLabel("Summe laut Bon (€, optional)").fill("100");
  await expect(page.getByText("Davon 58,00 € ohne Einzelpreis")).toBeVisible();
  await page.getByLabel("Notiz (optional)").fill(`Bon ${p}`);
  await shot(page, "einkauf-ausschank", p);
  await page.getByRole("button", { name: "Einkauf speichern · 100,00 €" }).click();

  await expect(page).toHaveURL(/\/verwaltung\/einkaeufe$/);
  const entry = page.getByRole("link").filter({ hasText: `Bon ${p}` });
  await expect(entry).toContainText("100,00 €");
  await entry.click();
  await expect(page.getByText(`2× 0,7 l ${jack}`, { exact: true })).toBeVisible();
  await expect(page.getByText(`64× ${helles}`, { exact: true })).toBeVisible();
  await expect(page.getByText("Preis nicht einzeln erfasst")).toBeVisible();
  await expect(page.getByText("1× Rest laut Bon (ohne Einzelpreis)", { exact: true })).toBeVisible();
});
