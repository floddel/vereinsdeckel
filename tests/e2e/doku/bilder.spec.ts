import { randomUUID } from "node:crypto";
import { devices, expect, test } from "@playwright/test";
import { AUTH_FILE } from "../fixtures";
import { createMemberWithLink, openVerwaltung, sendOps } from "../helpers";

/**
 * Bilder für README und Anleitungen (docs/bilder) – nur auf Abruf: npm run docs:bilder
 * Erfundene Daten: „TSV Musterstadt“, Beispielartikel und -mitglieder der Test-Datenbank.
 */
test.skip(!process.env.DOKU_BILDER, "nur mit npm run docs:bilder");
test.setTimeout(180_000);

// DOKU_DUNKEL=1: im Dunkelmodus, nur zum Prüfen (landet nicht in der Doku)
const dunkel = !!process.env.DOKU_DUNKEL;
const colorScheme = dunkel ? ("dark" as const) : ("light" as const);
const ziel = (name: string) => (dunkel ? `test-results/doku-dunkel/${name}.png` : `docs/bilder/${name}.png`);

test("Bilder für die Dokumentation", async ({ page, browser }) => {
  // Verein umbenennen
  await openVerwaltung(page, "/verwaltung/einstellungen");
  await page.getByLabel("Vereinsname").fill("TSV Musterstadt");
  await page.getByRole("button", { name: "Einstellungen speichern" }).click();
  await expect(page.getByText("Gespeichert").first()).toBeVisible();

  // Ein Abend mit ein paar Runden
  const stand = (await (await page.request.get("/api/theke/stand")).json()) as {
    articles: { id: string; name: string; priceCents: number }[];
    members: { id: string; name: string }[];
  };
  const art = (name: string) => stand.articles.find((a) => a.name === name)!;
  const line = (name: string, quantity: number, isGuest = false) => ({
    id: randomUUID(), articleId: art(name).id, articleName: name, quantity, unitPriceCents: art(name).priceCents, isGuest,
  });
  const now = new Date().toISOString();
  const runden: [number, ReturnType<typeof line>[]][] = [
    [0, [line("Pils 0,33", 3), line("Korn", 2)]],
    [3, [line("Weizen 0,5", 2), line("Bratwurst", 1)]],
    [7, [line("Pils 0,33", 4)]],
    [12, [line("Cola", 2), line("Currywurst", 1)]],
    [18, [line("Radler 0,33", 2), line("Pils 0,33", 1, true)]],
    [25, [line("Kaffee", 1), line("Pils 0,33", 2)]],
  ];
  await sendOps(page, runden.map(([i, lines]) => ({ type: "sale", id: randomUUID(), memberId: stand.members[i].id, createdAt: now, lines })));
  await sendOps(page, [{ type: "payment", id: randomUUID(), memberId: stand.members[3].id, createdAt: now, methodId: "cash", amountCents: 900, tipCents: 100, cashGivenCents: 1000, saleId: null }]);

  // Mitglied mit Bierdeckel
  const { id: anna, url } = await createMemberWithLink(page, "Anna Beispiel");
  await sendOps(page, [{ type: "sale", id: randomUUID(), memberId: anna, createdAt: now, lines: [line("Pils 0,33", 4), line("Korn", 1), line("Bratwurst", 1)] }]);

  // Heute: Tagesgericht und Tipp
  await openVerwaltung(page, "/verwaltung/heute");
  const specials = page.getByTestId("selbst-gekocht");
  const neu = specials.getByRole("button", { name: "Neues Gericht" });
  await expect(neu.or(specials.getByLabel("Gericht"))).toBeVisible();
  if (await neu.isVisible()) await neu.click();
  await specials.getByLabel("Gericht").fill("Kartoffelsuppe");
  await specials.getByLabel("Preis (€)").fill("4,00");
  await specials.getByLabel("Beschreibung für die Karte (optional)").fill("Mit Würstchen, dazu Brot");
  await specials.getByRole("button", { name: "Gericht anlegen" }).click();
  await expect(page.getByText("Kartoffelsuppe angelegt")).toBeVisible();
  const tip = page.getByTestId("tipp");
  await tip.getByLabel("Artikel").selectOption({ label: "Korn" });
  await tip.getByLabel("Spruch (optional)").fill("Der Klare zum Feierabend");
  await tip.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Tipp des Hauses gespeichert")).toBeVisible();

  // Einrichtung abschließen (sonst steht „Einrichtung fortsetzen“ auf der Übersicht)
  await openVerwaltung(page, "/verwaltung/einrichtung?schritt=6");
  await page.getByRole("button", { name: "Einrichtung abschließen" }).click();
  await expect(page).toHaveURL(/\/verwaltung$/);

  // Verwaltung (Desktop)
  await page.setViewportSize({ width: 1280, height: 860 });
  await openVerwaltung(page, "/verwaltung");
  await expect(page.getByTestId("kpi-cash")).toBeVisible();
  await page.screenshot({ path: ziel("verwaltung") });
  await openVerwaltung(page, "/verwaltung/abende");
  await page.getByTestId("abende").getByRole("row").nth(1).getByRole("link").click();
  await expect(page.getByTestId("abend-umsatz")).toBeVisible();
  await page.screenshot({ path: ziel("abendabschluss") });
  await openVerwaltung(page, "/verwaltung/einrichtung?schritt=5");
  await expect(page.getByTestId("einrichtung-artikel")).toBeVisible();
  await page.screenshot({ path: ziel("einrichtung") });

  // Theke (Tablet quer)
  const tablet = await browser.newContext({ ...devices["iPad (gen 11) landscape"], storageState: AUTH_FILE, locale: "de-DE", timezoneId: "Europe/Berlin", colorScheme });
  const t = await tablet.newPage();
  await t.goto("/theke");
  await expect(t.getByRole("searchbox", { name: "Mitglied suchen" })).toBeVisible();
  await t.screenshot({ path: ziel("theke") });
  if (process.env.DOKU_EXTRA) {
    // Zum Prüfen: gescrollt, damit man den Inhalt unter dem Glas sieht (nicht für die Doku)
    await t.locator("main").first().evaluate((m) => m.scrollBy(0, 160));
    await t.screenshot({ path: `test-results/doku-extra/theke-gescrollt${dunkel ? "-dunkel" : ""}.png` });
    await t.locator("main").first().evaluate((m) => m.scrollTo(0, 0));
  }
  await t.getByRole("button", { name: "Anna Beispiel" }).first().click();
  await t.getByRole("button", { name: /Pils 0,33/ }).first().click();
  await t.getByRole("button", { name: /Pils 0,33/ }).first().click();
  await t.getByRole("button", { name: /Korn/ }).first().click();
  await expect(t.getByRole("button", { name: /^Anschreiben/ })).toBeVisible();
  await t.screenshot({ path: ziel("theke-buchen") });
  await tablet.close();

  // Handy: Bierdeckel und Karte
  const phone = await browser.newContext({ ...devices["iPhone 15"], storageState: { cookies: [], origins: [] }, locale: "de-DE", timezoneId: "Europe/Berlin", colorScheme });
  const h = await phone.newPage();
  await h.goto(url);
  await expect(h.getByRole("heading", { name: "Hallo Anna Beispiel!" })).toBeVisible();
  await h.waitForTimeout(1500); // Striche fertig gezeichnet
  await h.screenshot({ path: ziel("handy-bierdeckel") });
  await h.goto("/karte");
  await expect(h.getByTestId("frisch-gekocht")).toBeVisible();
  await h.screenshot({ path: ziel("handy-karte") });
  await phone.close();
});
