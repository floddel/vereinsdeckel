import { expect, test } from "@playwright/test";
import { openVerwaltung, shot } from "../helpers";

// Bestand ist für alle Geräte derselbe: nacheinander laufen lassen.
test.describe.configure({ mode: "serial" });

test("Inventur setzt den Bestand, Einkauf erhöht ihn, Einkaufsliste zeigt Leeres", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await openVerwaltung(page, "/verwaltung/bestand");
  const korn = page.getByTestId("bestand").getByRole("row").filter({ hasText: "Korn" });
  await expect(korn).toBeVisible();

  // Inventur: Korn = 7
  await page.getByRole("button", { name: "Inventur machen" }).click();
  await expect(page.getByRole("heading", { name: "Inventur" })).toBeVisible();
  await page.getByLabel("Korn gezählt").fill("7");
  await page.getByLabel("Notiz").fill(`Zählung ${p}`);
  await page.getByRole("button", { name: "Inventur speichern (1 Artikel)" }).click();
  await expect(page).toHaveURL(/\/verwaltung\/bestand$/);
  await expect(korn.getByRole("cell").nth(1)).toHaveText("7");
  await expect(page.getByTestId("inventur").filter({ hasText: `Zählung ${p}` })).toBeVisible();

  // Einkauf: 12 Korn → 19
  await page.goto("/verwaltung/einkaeufe/neu");
  await page.getByLabel("Artikel").first().selectOption({ label: "Korn" });
  await page.getByLabel("Stück").first().fill("12");
  await page.getByLabel("Preis gesamt (€)").first().fill("9,99");
  await page.getByRole("button", { name: /^Einkauf speichern/ }).click();
  await expect(page).toHaveURL(/\/verwaltung\/einkaeufe$/);
  await page.goto("/verwaltung/bestand");
  await expect(korn.getByRole("cell").nth(1)).toHaveText("19");

  // Inventur: Korn = 0 → steht auf der Einkaufsliste
  await page.goto("/verwaltung/bestand/inventur");
  await page.getByLabel("Korn gezählt").fill("0");
  await expect(page.getByText("berechnet 19 · −19")).toBeVisible();
  await page.getByRole("button", { name: /^Inventur speichern/ }).click();
  await expect(page.getByTestId("einkaufsliste")).toContainText("Korn");
  await shot(page, "bestand", p);
});

test("Inventur mit angebrochener Flasche und mit Kisten", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const rum = `Havanna ${p}`;
  const wasser = `Wasser Kiste ${p}`;
  await openVerwaltung(page, "/verwaltung/artikel");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  await dialog.getByLabel("Name").fill(rum);
  await dialog.getByLabel("Vereinspreis (€)").fill("3");
  await dialog.getByRole("radio", { name: /^Ausschank/ }).click();
  await dialog.getByLabel("Portion", { exact: true }).fill("4 cl");
  await dialog.getByLabel("Übliche Flaschengröße", { exact: true }).fill("0,7 l");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  await dialog.getByLabel("Name").fill(wasser);
  await dialog.getByLabel("Vereinspreis (€)").fill("1");
  await dialog.getByLabel("Stück je Kiste (optional)").fill("20");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  await page.goto("/verwaltung/bestand/inventur");
  // Rum: 2 volle + ½ angebrochene Flasche
  await page.getByLabel(`${rum} volle Flaschen`).fill("2");
  await page.getByRole("radiogroup", { name: `${rum} angebrochene Flasche` }).getByRole("radio", { name: "½ Flasche" }).click();
  await expect(page.getByTestId("inventur-zeile").filter({ hasText: rum })).toContainText("+1,75 l");
  // Wasser: 2 Kisten + 3 einzeln
  await page.getByLabel(`${wasser} Kisten`).fill("2");
  await page.getByLabel(`${wasser} einzeln`).fill("3");
  await expect(page.getByTestId("inventur-zeile").filter({ hasText: wasser })).toContainText("+43");
  await shot(page, "inventur-einheiten", p);
  await page.getByRole("button", { name: "Inventur speichern (2 Artikel)" }).click();

  await expect(page).toHaveURL(/\/verwaltung\/bestand$/);
  const table = page.getByTestId("bestand");
  await expect(table.getByRole("row").filter({ hasText: rum }).getByRole("cell").nth(1)).toHaveText("≈ 2,5 Fl. · 43 × 4 cl");
  await expect(table.getByRole("row").filter({ hasText: wasser }).getByRole("cell").nth(1)).toHaveText("43");
  await expect(page.getByTestId("inventur").first()).toContainText(`${rum} +1,75 l`);
});

test("Anfangsbestand mit Warenwert, ganze Flasche aus dem Bestand des Glases", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const glas = `Filou Glas ${p}`;
  const flasche = `Filou Flasche ${p}`;
  await openVerwaltung(page, "/verwaltung/artikel");
  const dialog = page.getByRole("dialog");
  for (const [name, price, serving] of [
    [glas, "2,50", "0,25 l"],
    [flasche, "8", "1 l"],
  ]) {
    await page.getByRole("button", { name: "Neuer Artikel" }).click();
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Vereinspreis (€)").fill(price);
    await dialog.getByRole("radio", { name: /^Ausschank/ }).click();
    await dialog.getByLabel("Portion", { exact: true }).fill(serving);
    await dialog.getByLabel("Übliche Flaschengröße", { exact: true }).fill("1 l");
    if (name === flasche) await dialog.getByLabel("Bestand aus (optional)").selectOption({ label: glas });
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
  }
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: flasche })).toContainText(`Bestand aus ${glas}`);

  // Anfangsbestand: die Flasche ist nicht wählbar (eingekauft wird das Glas)
  await page.goto("/verwaltung/einkaeufe/neu");
  await page.getByLabel("Bezahlt aus").selectOption("opening");
  await expect(page.getByText("Ware war schon da (eigene Ware)")).toBeVisible();
  const line = page.getByRole("group", { name: "Position 1" });
  await expect(line.getByLabel("Artikel").locator("option", { hasText: flasche })).toHaveCount(0);
  await line.getByLabel("Artikel").selectOption({ label: glas });
  await line.getByLabel("Flaschen").fill("8");
  await line.getByLabel("Preis gesamt (€)").fill("27,92");
  await page.getByLabel("Notiz (optional)").fill(`Anfangsbestand ${p}`);
  await page.getByRole("button", { name: "Einkauf speichern · 27,92 €" }).click();
  await expect(page).toHaveURL(/\/verwaltung\/einkaeufe$/);
  await expect(page.getByRole("link").filter({ hasText: `Anfangsbestand ${p}` })).toContainText("Anfangsbestand");

  await page.goto("/verwaltung/bestand");
  const table = page.getByTestId("bestand");
  await expect(table.getByRole("row").filter({ hasText: glas }).getByRole("cell").nth(2)).toHaveText("27,92 €");
  await expect(table.getByRole("row").filter({ hasText: flasche })).toHaveCount(0);
  await expect(page.getByTestId("warenwert")).toContainText("Warenwert:");
});
