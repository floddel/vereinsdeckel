import { expect, test } from "@playwright/test";
import { openVerwaltung, shot } from "../helpers";

test("Einrichtungsassistent: alle Schritte, dann abschließen", async ({ page }, testInfo) => {
  // Die Einrichtung gilt für die ganze App – einmal reicht.
  test.skip(testInfo.project.name !== "desktop", "nur auf dem Desktop");
  await openVerwaltung(page, "/verwaltung");
  await page.getByTestId("einrichtung-fortsetzen").click();
  await expect(page).toHaveURL(/\/verwaltung\/einrichtung/);
  // „Weiter“ / „Zurück“ sind Links, die als Schaltflächen erscheinen
  const next = () => page.getByRole("button", { name: "Weiter" }).click();

  // 1 Verein & Theke
  await expect(page.getByLabel("Vereinsname")).toBeVisible();
  await shot(page, "einrichtung-1", testInfo.project.name);
  await next();
  // 2 Sicherheit
  await expect(page.getByTestId("zweiter-faktor")).toBeVisible();
  await next();
  // 3 Adresse: hier im Test eine Test-Adresse
  await expect(page.getByTestId("einrichtung-adresse")).toContainText("Test-Adresse");
  await next();
  // 4 Datenschutz
  await expect(page.getByRole("radio", { name: /Eigenes Gerät/ })).toBeVisible();
  await expect(page.getByLabel("Verantwortlich")).toBeVisible();
  await next();
  // 5 Artikel & Mitglieder: Vorlage nur bei leerer Artikelliste
  await expect(page.getByTestId("einrichtung-artikel")).toBeVisible();
  await expect(page.getByRole("button", { name: "Startvorlage übernehmen" })).toBeDisabled();
  await expect(page.getByTestId("einrichtung-mitglieder").getByRole("link", { name: "Liste importieren (CSV)" })).toBeVisible();
  await next();
  // 6 Fertig
  await expect(page.getByTestId("einrichtung-fertig")).toContainText("Geschafft!");
  await expect(page.getByTestId("einrichtung-fertig").getByRole("link", { name: /Entwicklung unterstützen/ })).toHaveAttribute("href", "/verwaltung/ueber");
  await page.getByRole("button", { name: "Zurück" }).click();
  await expect(page.getByTestId("einrichtung-artikel")).toBeVisible();
  await page.getByRole("link", { name: /Fertig/ }).click();
  await page.getByRole("button", { name: "Einrichtung abschließen" }).click();
  await expect(page).toHaveURL(/\/verwaltung$/);
  await expect(page.getByTestId("einrichtung-fortsetzen")).toHaveCount(0);
});
