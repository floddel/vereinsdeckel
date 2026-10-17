import { expect, test } from "@playwright/test";
import { openVerwaltung } from "../helpers";

// Nur die Bedienung – wirklich gelöscht und beendet wird in src/server/reset.test.ts
// (die Test-Datenbank teilen sich alle Browser-Tests, und „Testphase beenden“ ist endgültig).
test("Testphase: Mitglieder nehmen ihre Buchungen mit, Löschen erst nach Sicherung und „LÖSCHEN“", async ({ page }) => {
  await openVerwaltung(page, "/verwaltung/einstellungen");
  const karte = page.getByTestId("testphase");
  await expect(karte.getByRole("heading", { name: "Daten zurücksetzen" })).toBeVisible();

  await karte.getByRole("checkbox", { name: /^Mitglieder/ }).check();
  const buchungen = karte.getByRole("checkbox", { name: /^Buchungen/ });
  await expect(buchungen).toBeChecked();
  await expect(buchungen).toBeDisabled();
  await expect(karte.getByText("nötig für „Mitglieder“")).toBeVisible();
  await expect(karte.getByRole("checkbox", { name: /^Inventuren/ })).not.toBeChecked();

  const loeschen = karte.getByRole("button", { name: "Ausgewähltes endgültig löschen" });
  await expect(loeschen).toBeDisabled();
  const bestaetigen = karte.getByLabel(/eintippen/);
  await expect(bestaetigen).toBeDisabled();

  const [download] = await Promise.all([page.waitForEvent("download"), karte.getByRole("button", { name: "Sicherung herunterladen" }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.json$/);
  await bestaetigen.fill("löschen");
  await expect(loeschen).toBeEnabled();

  // Wieder abwählen: nichts ausgewählt, nichts zu löschen
  await karte.getByRole("checkbox", { name: /^Mitglieder/ }).uncheck();
  await expect(buchungen).not.toBeChecked();
  await expect(loeschen).toBeHidden();

  // Artikel: Einkäufe samt Anfangsbestand müssen mit
  await karte.getByRole("checkbox", { name: /^Artikel/ }).check();
  await expect(karte.getByRole("checkbox", { name: /^Einkäufe/ })).toBeChecked();
  await expect(karte.getByRole("checkbox", { name: /Anfangsbestand behalten/ })).not.toBeChecked();
  await expect(karte.getByRole("checkbox", { name: /Anfangsbestand behalten/ })).toBeDisabled();

  await expect(karte.getByRole("button", { name: /Testphase beenden/ })).toBeVisible();
});
