import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { NO_AUTH } from "../fixtures";
import { articleId, createMemberWithLink, openVerwaltung, sendOps, shot } from "../helpers";

test("Artikel anlegen, bearbeiten, deaktivieren und verschieben", async ({ page }, testInfo) => {
  const name = `Testbier ${testInfo.project.name}`;
  await openVerwaltung(page, "/verwaltung/artikel");
  await expect(page.getByRole("heading", { name: "Artikel" })).toBeVisible();
  // Liste vollständig geladen?
  await expect(page.getByText("Pils 0,33")).toBeVisible();

  // Anlegen mit ungültigem Preis → Fehlermeldung
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Vereinspreis (€)").fill("abc");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog.getByText(/gültigen Preis/)).toBeVisible();
  await shot(page, "artikel-dialog", testInfo.project.name);

  // korrigieren und speichern
  await dialog.getByLabel("Vereinspreis (€)").fill("2,5");
  await dialog.getByRole("radio", { name: "Weizen" }).click();
  await dialog.getByLabel(/Strich-Gruppe/).fill("Bier");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  const main = page.getByRole("main");
  const row = main.getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("2,50");
  await expect(row).toContainText("Bier");
  await shot(page, "artikel", testInfo.project.name);

  // bearbeiten: Preis ändern und deaktivieren
  await row.getByRole("button", { name: `${name} bearbeiten` }).click();
  await dialog.getByLabel("Vereinspreis (€)").fill("3");
  await dialog.getByRole("switch", { name: "Aktiv" }).click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText("3,00");
  await expect(row).toContainText("inaktiv");

  // nach oben verschieben
  const getraenke = main.locator("ol").first();
  const before = await getraenke.getByRole("listitem").allInnerTexts();
  const index = before.findIndex((t) => t.includes(name));
  await row.getByRole("button", { name: `${name} nach oben` }).click();
  await expect
    .poll(async () => (await getraenke.getByRole("listitem").allInnerTexts()).findIndex((t) => t.includes(name)))
    .toBe(index - 1);

  // bleibt nach dem Neuladen erhalten
  await page.reload();
  await expect(row).toBeVisible();
  const after = await main.locator("ol").first().getByRole("listitem").allInnerTexts();
  expect(after.findIndex((t) => t.includes(name))).toBe(index - 1);
});

test("Schalter „verfügbar“ direkt in der Liste: weg von der Karte, bleibt nach dem Neuladen", async ({ page, browser }, testInfo) => {
  const name = `Testradler ${testInfo.project.name}`;
  await openVerwaltung(page, "/verwaltung/artikel");
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Vereinspreis (€)").fill("2");
  await dialog.getByRole("radio", { name: "Weizen" }).click();
  // ohne Bestand: steht immer auf der Karte, egal was im Keller ist
  await dialog.getByRole("switch", { name: "Bestand führen" }).click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("main").getByRole("listitem").filter({ hasText: name });
  const verfuegbar = row.getByRole("switch", { name: `${name} verfügbar` });
  await expect(verfuegbar).toBeChecked();

  // Öffentliche Karte – ohne Anmeldung
  const guest = await browser.newContext({ storageState: NO_AUTH });
  const phone = await guest.newPage();
  await phone.goto("/karte");
  await expect(phone.getByText(name)).toBeVisible();

  // Ausschalten – ohne den Artikel zu öffnen. Der Schalter springt sofort um, gespeichert wird im Hintergrund.
  const gespeichert = page.waitForResponse((r) => r.request().method() === "POST" && !!r.request().headers()["next-action"]);
  await verfuegbar.click();
  await expect(verfuegbar).not.toBeChecked();
  await gespeichert;
  await phone.reload();
  await expect(phone.getByRole("heading", { name: "Was gibt's heute?" })).toBeVisible();
  await expect(phone.getByText(name)).toHaveCount(0);
  await guest.close();

  // bleibt gespeichert (und bleibt aus, damit er die anderen Tests nicht stört)
  await page.reload();
  await expect(verfuegbar).not.toBeChecked();
});

test("Essen als „per Handy bestellbar“ markieren (nur bei Essen möglich)", async ({ page }, testInfo) => {
  const name = `Testsuppe ${testInfo.project.name}`;
  await openVerwaltung(page, "/verwaltung/artikel");
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Vereinspreis (€)").fill("4");

  // bei Getränken gibt es den Schalter nicht
  await dialog.getByLabel("Kategorie").selectOption("getraenke");
  await expect(dialog.getByRole("switch", { name: "Per Handy bestellbar" })).toBeHidden();
  await dialog.getByLabel("Kategorie").selectOption("essen");
  await dialog.getByRole("switch", { name: "Per Handy bestellbar" }).click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  const row = page.getByRole("main").getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("per Handy");

  // wieder abschalten: Merkmal verschwindet
  await row.getByRole("button", { name: `${name} bearbeiten` }).click();
  await expect(dialog.getByRole("switch", { name: "Per Handy bestellbar" })).toBeChecked();
  await dialog.getByRole("switch", { name: "Per Handy bestellbar" }).click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(row).not.toContainText("per Handy");
});

test("Artikel löschen: unbenutzt ja, schon gebucht nur inaktiv setzen", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const create = async (name: string) => {
    await openVerwaltung(page, "/verwaltung/artikel");
    await page.getByRole("button", { name: "Neuer Artikel" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Vereinspreis (€)").fill("1");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toBeHidden();
    return page.getByRole("main").getByRole("listitem").filter({ hasText: name });
  };

  // nie benutzt → endgültig löschen
  const unused = `Unbenutzt ${p}`;
  const row = await create(unused);
  await row.getByRole("button", { name: `${unused} bearbeiten` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Endgültig löschen" }).click();
  await expect(page.getByText(`„${unused}“ gelöscht`)).toBeVisible();
  await expect(row).toHaveCount(0);

  // schon gebucht → nur inaktiv
  const used = `Gebucht ${p}`;
  const usedRow = await create(used);
  const { id } = await createMemberWithLink(page, `Käufer ${p}`);
  const a = await articleId(page, used);
  await sendOps(page, [
    {
      type: "sale",
      id: randomUUID(),
      memberId: id,
      createdAt: new Date().toISOString(),
      lines: [{ id: randomUUID(), articleId: a.id, articleName: used, quantity: 1, unitPriceCents: a.priceCents, isGuest: false }],
    },
  ]);
  await openVerwaltung(page, "/verwaltung/artikel");
  await usedRow.getByRole("button", { name: `${used} bearbeiten` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Löschen" }).click();
  const alert = page.getByRole("alertdialog");
  await expect(alert.getByRole("heading", { name: "Löschen nicht möglich" })).toBeVisible();
  await expect(alert.getByRole("button", { name: "Endgültig löschen" })).toHaveCount(0);
  await alert.getByRole("button", { name: "Stattdessen inaktiv setzen" }).click();
  await expect(usedRow).toContainText("inaktiv");
});

test("Verkauft als: Ausschank mit Portion und Flasche, Stück mit Kiste", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await openVerwaltung(page, "/verwaltung/artikel");
  const dialog = page.getByRole("dialog");

  // Schnaps: 2 cl aus 0,7 l
  const schnaps = `Kirsche ${p}`;
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  await dialog.getByLabel("Name").fill(schnaps);
  await dialog.getByLabel("Vereinspreis (€)").fill("1,50");
  await dialog.getByRole("radio", { name: /^Ausschank/ }).click();
  await dialog.getByRole("group", { name: "Portion: Schnellwahl" }).getByRole("button", { name: "2 cl" }).click();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog.getByText("Bitte die Flaschengröße angeben, z. B. 0,7 l")).toBeVisible();
  await dialog.getByRole("group", { name: "Übliche Flaschengröße: Schnellwahl" }).getByRole("button", { name: "0,7 l" }).click();
  await expect(dialog.getByText("Bitte die Flaschengröße angeben, z. B. 0,7 l")).toBeHidden();
  await shot(page, "artikel-ausschank", p);
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  const row = page.getByRole("main").getByRole("listitem").filter({ hasText: schnaps });
  await expect(row).toContainText("2 cl aus 0,7 l");

  // Bier: Kiste mit 20
  const bier = `Helles ${p}`;
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  await dialog.getByLabel("Name").fill(bier);
  await dialog.getByLabel("Vereinspreis (€)").fill("2");
  await dialog.getByLabel("Stück je Kiste (optional)").fill("20");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: bier })).toContainText("Kiste 20");

  // freie Eingabe beim Bearbeiten bleibt erhalten
  await row.getByRole("button", { name: `${schnaps} bearbeiten` }).click();
  await expect(dialog.getByLabel("Portion", { exact: true })).toHaveValue("2 cl");
  await dialog.getByLabel("Portion", { exact: true }).fill("4cl");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(row).toContainText("4 cl aus 0,7 l");
});
