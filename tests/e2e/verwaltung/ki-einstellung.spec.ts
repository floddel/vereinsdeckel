import { expect, test } from "@playwright/test";
import { TEST_KEY } from "../ai-test-key.mjs";
import { openAiSettings } from "../helpers";

// Die Einstellung gilt für alle Geräte: nacheinander laufen lassen.
test.describe.configure({ mode: "serial" });

test("KI-Schlüssel: falscher abgelehnt, richtiger maskiert gespeichert, ein-/ausschalten, entfernen", async ({ page }) => {
  const { card, hasKey } = await openAiSettings(page);
  const toggle = page.getByRole("switch", { name: "Kassenbon-Erkennung verwenden" });

  // ohne Schlüssel lässt sich nichts einschalten
  if (await hasKey()) {
    await card.getByRole("button", { name: "Entfernen", exact: true }).click();
    await expect(page.getByText("Schlüssel entfernt")).toBeVisible();
  }
  await expect(card).toContainText("Kein API-Schlüssel hinterlegt");
  await expect(toggle).toBeDisabled();

  await page.getByLabel("API-Schlüssel").fill("sk-ant-falsch-0123456789abcdef");
  await page.getByRole("button", { name: "Prüfen & speichern" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "nicht akzeptiert" })).toBeVisible();

  await page.getByLabel("API-Schlüssel").fill(TEST_KEY);
  await page.getByRole("button", { name: "Prüfen & speichern" }).click();
  await expect(card).toContainText(`API-Schlüssel hinterlegt: sk-ant-…${TEST_KEY.slice(-4)}`);
  await expect(page.getByLabel("Neuen Schlüssel eingeben")).toHaveValue("");
  // der volle Schlüssel steht nirgends in der Seite
  expect(await page.content()).not.toContain(TEST_KEY);

  await toggle.click();
  await expect(page.getByText("Kassenbon-Erkennung eingeschaltet")).toBeVisible();
  await expect(toggle).toBeChecked();

  // Entfernen schaltet auch aus
  await card.getByRole("button", { name: "Entfernen", exact: true }).click();
  await expect(card).toContainText("Kein API-Schlüssel hinterlegt");
  await expect(toggle).not.toBeChecked();
});
