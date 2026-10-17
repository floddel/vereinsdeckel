import { expect, type Page, test } from "@playwright/test";
import { TEST_KEY } from "../ai-test-key.mjs";
import { openAiSettings, shot } from "../helpers";

// KI-Einstellung gilt für alle Geräte: nacheinander laufen lassen.
test.describe.configure({ mode: "serial" });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==",
  "base64",
);

async function enableAi(page: Page) {
  const { card, hasKey } = await openAiSettings(page);
  if (!(await hasKey())) {
    await page.locator("#ai-key").fill(TEST_KEY);
    await page.getByRole("button", { name: "Prüfen & speichern" }).click();
    await expect(card).toContainText("API-Schlüssel hinterlegt: sk-ant-");
  }
  const toggle = page.getByRole("switch", { name: "Kassenbon-Erkennung verwenden" });
  if (!(await toggle.isChecked())) await toggle.click();
  await expect(toggle).toBeChecked();
}

async function scan(page: Page) {
  await page.goto("/verwaltung/einkaeufe/neu");
  await expect(page.getByLabel("Kassenbon fotografieren")).toBeEnabled();
  await page.getByLabel("Kassenbon fotografieren").setInputFiles({ name: "bon.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByTestId("erkannt")).toContainText("3 Positionen erkannt (Metro Teststadt)", { timeout: 20_000 });
}

test("Kassenbon fotografieren: KI füllt aus, Korrektur möglich, Zuordnung wird gelernt", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await enableAi(page);
  await scan(page);

  const positions = page.getByTestId("position");
  await expect(positions).toHaveCount(3);
  // Pils erkannt: 2 × 20er-Kiste = 40 Stück (Pils hat keine Kistengröße → Stück)
  await expect(positions.nth(0).getByLabel("Artikel")).toHaveValue(/.+/);
  await expect(positions.nth(0).getByLabel("Stück")).toHaveValue("40");
  await expect(positions.nth(0).getByLabel("Preis gesamt (€)")).toHaveValue("33,98");
  await expect(positions.nth(0)).toContainText("KROMB.PILS 20X0,5L");
  // ohne Artikel: markiert, Bon-Text als Beschreibung
  await expect(positions.nth(1).getByLabel("Beschreibung Position 2")).toHaveValue("GRILLKOHLE 3KG");
  await expect(positions.nth(1)).toContainText("kein Artikel – wählen oder als Freitext lassen");
  await expect(positions.nth(0)).not.toContainText("kein Artikel");
  await expect(page.getByLabel("Summe laut Bon (€, optional)")).toHaveValue("47,96");
  await expect(page.getByLabel("Einkaufsdatum")).toHaveValue("2026-10-14");
  await expect(page.getByRole("img", { name: "Vorschau des Belegs" })).toBeVisible();
  await shot(page, "einkauf-ki", p);

  // Korrektur: Notiz ergänzen, dann speichern
  await page.getByLabel("Notiz (optional)").fill(`Metro KI ${p}`);
  await page.getByRole("button", { name: "Einkauf speichern · 47,96 €" }).click();
  await expect(page).toHaveURL(/\/verwaltung\/einkaeufe$/);
  const entry = page.getByRole("link").filter({ hasText: `Metro KI ${p}` });
  await expect(entry).toContainText("47,96 €");
  await expect(entry.getByLabel("mit Beleg")).toBeVisible();

  // zweiter Bon: Pils kommt jetzt aus der gelernten Zuordnung
  await scan(page);
  await expect(page.getByTestId("position").nth(0)).toContainText("✓ gelernt");
});

test("Ausgeschaltet: kein Kamera-Knopf beim Einkauf", async ({ page }) => {
  await openAiSettings(page);
  const toggle = page.getByRole("switch", { name: "Kassenbon-Erkennung verwenden" });
  if (await toggle.isChecked()) await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.goto("/verwaltung/einkaeufe/neu");
  await expect(page.getByLabel("Kassenbon fotografieren")).toHaveCount(0);
  await expect(page.getByText("Tipp: In den Einstellungen lässt sich die Kassenbon-Erkennung")).toBeVisible();
});
