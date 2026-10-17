import { expect, type Page, test } from "@playwright/test";
import { openVerwaltung, shot } from "../helpers";

/** „1.234,56 €“ → 123456 */
const cents = (text: string) => {
  const m = /(−|-)?([\d.]+),(\d{2})/.exec(text);
  if (!m) throw new Error(`Kein Betrag in „${text}“`);
  return (m[1] ? -1 : 1) * (Number(m[2].replace(/\./g, "")) * 100 + Number(m[3]));
};
const balance = async (page: Page, pot: "cash" | "paypal") => cents(await page.getByTestId(`topf-${pot}`).getByText(/€/).innerText());

// Die Kasse ist für alle Geräte dieselbe: nacheinander laufen lassen und nur Veränderungen prüfen.
test.describe.configure({ mode: "serial" });

test("Einlage, Umbuchung und Storno verändern das Soll", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  await openVerwaltung(page, "/verwaltung/kasse");
  const cash0 = await balance(page, "cash");
  const paypal0 = await balance(page, "paypal");

  // Einlage 50 € in die Handkasse
  await page.getByRole("button", { name: "Bewegung buchen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Betrag (€)").fill("50");
  await dialog.getByLabel("Notiz").fill(`Wechselgeld ${p}`);
  await dialog.getByRole("button", { name: "Buchen" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => balance(page, "cash")).toBe(cash0 + 5000);

  // Umbuchung 10 € PayPal → Handkasse
  await page.getByRole("button", { name: "Bewegung buchen" }).click();
  await dialog.getByRole("radio", { name: "Umbuchung" }).click();
  await dialog.getByLabel("Von").selectOption("paypal");
  await dialog.getByLabel("Nach").selectOption("cash");
  await dialog.getByLabel("Betrag (€)").fill("99999");
  await expect(dialog.getByText(/^Achtung: Laut App sind nur/)).toBeVisible();
  await dialog.getByLabel("Betrag (€)").fill("10");
  await dialog.getByLabel("Notiz").fill(`abgehoben ${p}`);
  await dialog.getByRole("button", { name: "Buchen" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => balance(page, "cash")).toBe(cash0 + 6000);
  expect(await balance(page, "paypal")).toBe(paypal0 - 1000);
  await expect(page.getByTestId("bewegung").filter({ hasText: `abgehoben ${p}` })).toContainText("PayPal → Handkasse");

  // Storno der Einlage
  const einlage = page.getByTestId("bewegung").filter({ hasText: `Wechselgeld ${p}` });
  await einlage.getByRole("button", { name: "Einlage stornieren" }).click();
  await page.getByRole("dialog").getByLabel("Begründung").fill("Tippfehler");
  await page.getByRole("dialog").getByRole("button", { name: "Stornieren" }).click();
  await expect(einlage).toContainText("storniert: Tippfehler");
  await expect.poll(() => balance(page, "cash")).toBe(cash0 + 1000);
  await shot(page, "kasse", p);
});

test("Kasse zählen: Differenz anzeigen und auf Wunsch übernehmen", async ({ page }, testInfo) => {
  await openVerwaltung(page, "/verwaltung/kasse");
  const soll = await balance(page, "cash");
  // mehr als das Soll zählen (das Soll kann in der Testdatenbank auch im Minus stehen)
  const counted = Math.max(soll, 0) + 50;
  const diff = counted - soll;
  const euro = (c: number) => `${Math.floor(c / 100)},${String(c % 100).padStart(2, "0")}`;

  await page.getByRole("button", { name: "Kasse zählen" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Gezählt (€)").fill(euro(counted));
  await expect(dialog.getByTestId("zaehl-vergleich")).toContainText(`${euro(diff)} € zu viel`);
  await dialog.getByRole("switch", { name: "Differenz übernehmen" }).click();
  await dialog.getByLabel("Notiz (optional)").fill(`Zählung ${testInfo.project.name}`);
  await dialog.getByRole("button", { name: "Zählung speichern" }).click();
  await expect(dialog).toBeHidden();

  await expect.poll(() => balance(page, "cash")).toBe(counted);
  await expect(page.getByTestId("zaehlung").filter({ hasText: `Zählung ${testInfo.project.name}` })).toContainText(`+${euro(diff)} € · übernommen`);
});

test("Kassenbuch: Endbestand = Soll, CSV zum Herunterladen", async ({ page }, testInfo) => {
  await openVerwaltung(page, "/verwaltung/kasse");
  const soll = await balance(page, "cash");
  await page.getByRole("button", { name: "Kassenbuch" }).click();
  await expect(page.getByRole("heading", { name: "Kassenbuch" })).toBeVisible();
  // alle Testdaten stammen aus diesem Jahr → Endbestand = Soll
  expect(cents(await page.getByTestId("endbestand").innerText())).toBe(soll);
  await expect(page.getByTestId("kassenbuch")).toContainText("Einlage");
  await shot(page, "kassenbuch", testInfo.project.name);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Als CSV herunterladen" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^kassenbuch-handkasse-\d{4}-01-01-bis-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString("utf8"));
  expect(text.startsWith("﻿Datum;Topf;Art;Beschreibung;Einnahme;Ausgabe;Bestand")).toBe(true);
  expect(text).toContain(";Handkasse;Übertrag;");

  // ohne Anmeldung kein Kassenbuch
  const anon = await page.context().browser()!.newContext({ baseURL: "http://localhost:3100" });
  expect((await anon.request.get("/api/kassenbuch")).status()).toBe(401);
  await anon.close();
});
