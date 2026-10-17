import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { articleId, createMemberWithLink, openVerwaltung, sendOps, shot } from "../helpers";

test.describe.configure({ mode: "serial" });

test("Datenschutz-Seite: auf einen Blick, Angaben, Checkliste – öffentlicher Hinweis", async ({ page }, testInfo) => {
  await openVerwaltung(page, "/verwaltung/datenschutz");
  await expect(page.getByTestId("datenschutz-fakten")).toContainText("Nur ein Name");
  await expect(page.getByTestId("auftragsverarbeiter")).toContainText("Neon");

  await page.getByLabel("Verantwortlich").fill("Max Hauswart");
  await page.getByLabel("Anschrift").fill("Seeweg 1\n12345 Angelstadt");
  await page.getByLabel("E-Mail für Datenschutzfragen").fill("datenschutz@example.org");
  await page.getByLabel("Bundesland (für die Aufsichtsbehörde)").selectOption("Berlin");
  await expect(page.getByLabel("Zuständige Aufsichtsbehörde")).toHaveValue(/Berliner Beauftragte für Datenschutz/);
  await page.getByTestId("datenschutz-angaben").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("der Datenschutzhinweis ist aktualisiert")).toBeVisible();
  await expect(page.getByTestId("datenschutz-checkliste")).not.toContainText("Es fehlt");

  // Haken bleibt nach dem Neuladen gesetzt
  const check = page.getByRole("checkbox", { name: /Datenschutzhinweis gelesen und geprüft/ });
  await check.setChecked(true);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(check).toBeChecked();
  await shot(page, "datenschutz-verwaltung", testInfo.project.name);

  await page.goto("/datenschutz");
  await expect(page.getByRole("heading", { name: "Datenschutz", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("Max Hauswart");
  await expect(page.getByRole("main")).toContainText("Berliner Beauftragte für Datenschutz");
  await expect(page.getByRole("main")).not.toContainText("in der Verwaltung eintragen");
  await shot(page, "datenschutz-hinweis", testInfo.project.name);
});

test("Wo läuft die App? Hinweis, Auftragsverarbeiter und Checkliste passen sich an", async ({ page }) => {
  await openVerwaltung(page, "/verwaltung/datenschutz");
  const hosting = page.getByTestId("hosting");
  const save = async () => {
    await hosting.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("Datenschutzhinweis und Checkliste sind angepasst").last()).toBeVisible();
  };

  // Eigenes Gerät: keine Auftragsverarbeiter, eigener Checklistenpunkt
  await hosting.getByRole("radio", { name: /Eigenes Gerät/ }).check();
  await save();
  await expect(page.getByTestId("auftragsverarbeiter")).toContainText("Keine – die App läuft auf einem eigenen Gerät.");
  await expect(page.getByTestId("datenschutz-checkliste")).toContainText("Das Gerät ist mit Passwort geschützt");
  await expect(page.getByTestId("datenschutz-checkliste")).not.toContainText("Neon");
  await expect(page.getByTestId("datenschutz-fakten")).toContainText("Daten bleiben bei uns");
  await page.goto("/datenschutz");
  await expect(page.getByRole("main")).toContainText("Die App läuft auf einem eigenen Gerät");
  await expect(page.getByRole("main")).not.toContainText("Vercel");

  // Anderer Anbieter: mit Namen, Standort und Vertrag
  await page.goto("/verwaltung/datenschutz");
  await hosting.getByRole("radio", { name: /Anderer Anbieter/ }).check();
  await hosting.getByRole("button", { name: "Speichern" }).click();
  await expect(hosting.getByText("Bitte den Anbieter angeben")).toBeVisible();
  await hosting.getByLabel("Anbieter", { exact: true }).fill("Hetzner Online GmbH");
  await hosting.getByLabel("Standort").fill("Falkenstein (Deutschland)");
  await hosting.getByLabel("Vertrag zur Auftragsverarbeitung (AVV)").fill("im Kundenkonto abgeschlossen");
  await save();
  await expect(page.getByTestId("auftragsverarbeiter")).toContainText("Hetzner Online GmbH");
  await page.goto("/datenschutz");
  await expect(page.getByRole("main")).toContainText("Hetzner Online GmbH");
  await expect(page.getByRole("main")).toContainText("Falkenstein (Deutschland)");

  // Zurück auf Vercel + Neon (wie bei uns)
  await page.goto("/verwaltung/datenschutz");
  await hosting.getByRole("radio", { name: /Vercel \+ Neon/ }).check();
  await save();
  await expect(page.getByTestId("auftragsverarbeiter")).toContainText("Neon");
  await expect(page.getByTestId("auftragsverarbeiter")).not.toContainText("Hetzner");
});

test("Datenschutz-Hinweis ist ohne Anmeldung erreichbar und verlinkt", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByRole("link", { name: "Datenschutz" }).click();
  await expect(page).toHaveURL(/\/datenschutz$/);
  await expect(page.getByRole("heading", { name: "Wer ist verantwortlich?" })).toBeVisible();
  await ctx.close();
});

test("Auskunft und Anonymisieren eines Mitglieds", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const name = `Datenschutz Test ${p}`;
  const { id, url } = await createMemberWithLink(page, name);
  const pils = await articleId(page, "Pils 0,33");
  const now = new Date().toISOString();
  await sendOps(page, [
    { type: "sale", id: randomUUID(), memberId: id, createdAt: now, lines: [{ id: randomUUID(), articleId: pils.id, articleName: "Pils 0,33", quantity: 1, unitPriceCents: pils.priceCents, isGuest: false }] },
  ]);

  // Bierdeckel verlinkt den Datenschutzhinweis
  await page.goto(url);
  await expect(page.getByRole("link", { name: "Datenschutz" })).toHaveAttribute("href", "/datenschutz");

  // Auskunft als Datei
  const json = await page.request.get(`/api/datenschutz/mitglied/${id}?format=json`);
  expect(json.headers()["content-type"]).toContain("application/json");
  const data = await json.json();
  expect(data.mitglied.name).toBe(name);
  expect(data.offenerBetrag).toBe(pils.priceCents / 100);
  expect(JSON.stringify(data)).not.toContain(url.split("/").at(-1));
  const csv = await page.request.get(`/api/datenschutz/mitglied/${id}?format=csv`);
  expect(await csv.text()).toContain("Verzehr;Pils 0,33;1");

  // Mit offenem Betrag: erst begleichen
  await page.goto(`/verwaltung/mitglieder/${id}`);
  await page.getByRole("button", { name: "Anonymisieren" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Erst den Deckel begleichen");
  await page.getByRole("button", { name: "Schließen" }).click();

  await sendOps(page, [{ type: "payment", id: randomUUID(), memberId: id, createdAt: now, methodId: "cash", amountCents: pils.priceCents, tipCents: 0, cashGivenCents: null, saleId: null }]);
  await page.reload();
  await page.getByRole("button", { name: "Anonymisieren" }).click();
  await page.getByRole("button", { name: "Endgültig anonymisieren" }).click();
  await expect(page).toHaveURL(/\/verwaltung\/mitglieder$/);
  await expect(page.getByText(/ist jetzt „Ehemaliges Mitglied #\d+“/)).toBeVisible();
  // (Rollen-Abfragen sehen nur Sichtbares – die vorige Seite hält Next.js verborgen im Hintergrund)
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  // alter Link zeigt nichts mehr
  await page.goto(url);
  await expect(page.getByRole("heading", { name: new RegExp(name) })).toHaveCount(0);
  await expect(page.getByRole("heading").first()).toBeVisible();
});
