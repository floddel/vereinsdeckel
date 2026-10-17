import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { articleId, createMemberWithLink, openVerwaltung, sendOps, shot } from "../helpers";

test("Mitglied anlegen, Name doppelt, Link sperren und erneuern", async ({ page }, testInfo) => {
  // Eindeutige Namen je Gerät, weil alle Geräte dieselbe Test-Datenbank nutzen.
  const name = `Klaus Test ${testInfo.project.name}`;
  await openVerwaltung(page, "/verwaltung/mitglieder");

  await page.getByRole("button", { name: "Neues Mitglied" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Mitgliedsnummer")).toHaveCount(0);
  await expect(dialog.getByLabel(/E-Mail/)).toHaveCount(0);
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("button", { name: "Speichern" }).click();

  // Neues Mitglied → Detailseite mit Link und QR-Code
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const urlBox = page.getByTestId("member-url");
  await expect(urlBox).toContainText("/m/");
  const firstUrl = await urlBox.innerText();
  await expect(page.getByRole("img", { name: `QR-Code für ${name}` })).toBeVisible();
  await shot(page, "mitglied", testInfo.project.name);

  // gleicher Name (andere Schreibweise) → Fehlermeldung, Eingabe bleibt
  await page.goto("/verwaltung/mitglieder");
  await page.getByRole("button", { name: "Neues Mitglied" }).click();
  const twin = `  ${name.toUpperCase()} `;
  await dialog.getByLabel("Name").fill(twin);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog.getByText("Diesen Namen gibt es schon")).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveValue(twin);
  await page.keyboard.press("Escape");

  // Suche findet das Mitglied
  await page.getByLabel("Mitglieder suchen").fill(name.toLowerCase());
  await page.getByRole("link", { name }).first().click();

  // Link sperren
  await page.getByRole("button", { name: "Link sperren" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sperren" }).click();
  await expect(page.getByText("Der Link ist gesperrt")).toBeVisible();

  // neuen Link erzeugen → andere Adresse
  await page.getByRole("button", { name: "Neuen Link erzeugen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Neuen Link erzeugen" }).click();
  await expect(urlBox).toBeVisible();
  expect(await urlBox.innerText()).not.toBe(firstUrl);
});

test("CSV-Import mit Vorschau und QR-Druckseite", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await openVerwaltung(page, "/verwaltung/mitglieder/import");
  // Typischer Excel-Export: Vorname/Nachname getrennt, dazu Spalten, die nicht übernommen werden
  const csv = [
    "Mitgliedsnummer;Vorname;Nachname;E-Mail",
    `50;Jürgen;Weiß ${p};`,
    `51;Hans;Meier ${p};hans@example.org`,
    `52;;;`,
    `53;jürgen;weiß ${p};`,
  ].join("\n");
  await page.getByLabel("CSV-Inhalt").fill(csv);
  await page.getByRole("button", { name: "Vorschau anzeigen" }).click();

  await expect(page.getByText("Nicht übernommen (Datensparsamkeit): Mitgliedsnummer, E-Mail")).toBeVisible();
  await expect(page.getByText("2 Zeilen mit Fehlern")).toBeVisible();
  await expect(page.getByText("Zeile 4: Name fehlt")).toBeVisible();
  await expect(page.getByText(`Zeile 5: „jürgen weiß ${p}“ steht doppelt in der Datei`)).toBeVisible();
  await expect(page.getByRole("cell", { name: `Hans Meier ${p}` })).toBeVisible();
  await expect(page.getByText("hans@example.org")).toHaveCount(0);
  await shot(page, "import-vorschau", testInfo.project.name);
  await page.getByRole("button", { name: "2 Mitglieder importieren" }).click();
  await expect(page.getByText("2 Mitglieder importiert, 2 übersprungen")).toBeVisible();

  // nochmal importieren → schon vorhanden
  await page.goto("/verwaltung/mitglieder/import");
  await page.getByLabel("CSV-Inhalt").fill(csv);
  await page.getByRole("button", { name: "Vorschau anzeigen" }).click();
  await expect(page.getByText("schon vorhanden")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "0 Mitglieder importieren" })).toBeDisabled();

  await page.goto("/verwaltung/mitglieder/qr");
  await expect(page.getByText(`Jürgen Weiß ${p}`)).toBeVisible();
  // Tests laufen auf localhost → Hinweis „noch nicht drucken“
  await expect(page.getByText("Test-Adresse – QR-Karten noch nicht drucken")).toBeVisible();
  await expect(page.locator(".qr-card svg").first()).toBeVisible();
  await shot(page, "qr", testInfo.project.name);
});

test("QR-Druck: 8 Karten pro A4-Seite", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "PDF-Ausgabe nur mit Chromium");
  await openVerwaltung(page, "/verwaltung/mitglieder/qr");
  await expect(page.locator(".qr-card").first()).toBeVisible();
  const cards = await page.locator(".qr-card").count();
  const pdf = await page.pdf({ format: "A4", preferCSSPageSize: true, path: "test-results/shots/qr.pdf" });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  expect(pages).toBe(Math.ceil(cards / 8));
});

test("Mitglied löschen: ohne Buchungen ja, mit Buchungen nur inaktiv setzen", async ({ page }, testInfo) => {
  const p = testInfo.project.name;

  // vertippt angelegt → löschen
  const typo = `Vertippt ${p}`;
  await createMemberWithLink(page, typo);
  await page.getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page).toHaveURL(/\/verwaltung\/mitglieder$/);
  await expect(page.getByRole("link", { name: "Neues Mitglied" }).or(page.getByRole("button", { name: "Neues Mitglied" }))).toBeVisible();
  await expect(page.getByRole("link", { name: typo })).toHaveCount(0);

  // mit Buchung → Löschen nicht möglich, stattdessen inaktiv
  const name = `Stammgast ${p}`;
  const { id } = await createMemberWithLink(page, name);
  const pils = await articleId(page, "Pils 0,33");
  await sendOps(page, [
    {
      type: "sale",
      id: randomUUID(),
      memberId: id,
      createdAt: new Date().toISOString(),
      lines: [{ id: randomUUID(), articleId: pils.id, articleName: "Pils 0,33", quantity: 1, unitPriceCents: pils.priceCents, isGuest: false }],
    },
  ]);
  await page.reload();
  await page.getByRole("button", { name: "Löschen" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("heading", { name: "Löschen nicht möglich" })).toBeVisible();
  await dialog.getByRole("button", { name: "Stattdessen inaktiv setzen" }).click();
  await expect(page.getByText(`${name} ist jetzt inaktiv`)).toBeVisible();
  await expect(page.getByText("inaktiv", { exact: true })).toBeVisible();

  // Theke: inaktive Mitglieder tauchen nicht auf
  const stand = (await (await page.request.get("/api/theke/stand")).json()) as { members: { id: string }[] };
  expect(stand.members.some((m) => m.id === id)).toBe(false);
});
