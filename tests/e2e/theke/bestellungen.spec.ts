import { expect, type Page, test } from "@playwright/test";
import { createMemberWithLink, shot, thekeOrders } from "../helpers";

async function openTheke(page: Page) {
  await page.goto("/theke");
  await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toBeVisible();
}

async function orderOnPhone(phone: Page, url: string, items: [string, number][], note = "") {
  await phone.goto(`${url}/bestellen`);
  for (const [name, n] of items) for (let i = 0; i < n; i++) await phone.getByRole("button", { name: `${name} mehr` }).click();
  if (note) await phone.getByLabel("Wunsch (optional)").fill(note);
  await phone.getByRole("button", { name: /^Bestellen/ }).click();
  await expect(phone.getByText("Bestellung ist raus!")).toBeVisible();
}

test.afterEach(async ({ page }) => {
  await thekeOrders(page, { kitchenOpen: false });
});

test("Pflichttest: Handy bestellt → Tablet sieht es → Annehmen → Fertig → Abgeholt → Bierdeckel", async ({ page, context }, testInfo) => {
  const p = testInfo.project.name;
  const name = `Bestellt ${p}`;
  const { url } = await createMemberWithLink(page, name);
  await thekeOrders(page, { kitchenOpen: false });
  await openTheke(page);

  // Küche an der Theke aufmachen
  await page.getByRole("button", { name: /^Küche/ }).click();
  const sheet = page.getByRole("dialog", { name: "Küche & Handy-Bestellungen" });
  await sheet.getByRole("switch", { name: "Küche offen" }).click();
  await expect(page.getByText("Küche ist offen – Mitglieder können bestellen")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // Handy bestellt
  const phone = await context.newPage();
  await orderOnPhone(phone, url, [["Bratwurst", 2]], "mit Senf");

  // Tablet: Bestellung erscheint von selbst in der Leiste, mit Hinweis
  const card = page.getByTestId("theke-bestellung").filter({ hasText: name });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card).toContainText("2× Bratwurst");
  await expect(card).toContainText("„mit Senf“");
  await expect(page.getByText(`Neue Bestellung von ${name}`)).toBeVisible();
  await expect(phone.getByTestId("bestellung")).toContainText("Eingegangen", { timeout: 15_000 });
  await shot(page, "theke-bestellung", p);

  await card.getByRole("button", { name: "Annehmen" }).click();
  await expect(card).toHaveAttribute("data-status", "accepted");
  await expect(phone.getByTestId("bestellung")).toContainText("Wird zubereitet", { timeout: 15_000 });

  await card.getByRole("button", { name: "Fertig" }).click();
  await expect(card).toHaveAttribute("data-status", "ready");
  await expect(phone.getByTestId("bestellung")).toContainText("Fertig – bitte abholen!", { timeout: 15_000 });

  // Abgeholt → wird angeschrieben
  await card.getByRole("button", { name: "Abgeholt" }).click();
  await expect(card).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: `2× Bratwurst für ${name} angeschrieben (6,00 €)` })).toBeVisible();
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "ok");

  // Bierdeckel auf dem Handy zeigt die Buchung
  await phone.goto(url);
  await expect(phone.getByRole("img", { name: "Wurst: 2 Striche" })).toBeVisible();
  await expect(phone.getByTestId("offen")).toHaveText("6,00 €");
  await expect(phone.getByTestId("bestell-hinweis")).toBeHidden();

  // Theke: Mitglied hat jetzt 6,00 € offen
  await page.getByRole("searchbox", { name: "Mitglied suchen" }).fill(name);
  await page.getByRole("main").getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await expect(page.getByTestId("theke-open")).toHaveText("6,00 €");
});

test("Ablehnen mit Grund – Handy sieht den Grund", async ({ page, context }, testInfo) => {
  const name = `Abgelehnt ${testInfo.project.name}`;
  const { url } = await createMemberWithLink(page, name);
  await thekeOrders(page, { kitchenOpen: true });
  await openTheke(page);

  const phone = await context.newPage();
  await orderOnPhone(phone, url, [["Fischbrötchen", 1]]);

  const card = page.getByTestId("theke-bestellung").filter({ hasText: name });
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByRole("button", { name: `Bestellung von ${name} ablehnen` }).click();
  const dialog = page.getByRole("dialog", { name: "Bestellung ablehnen" });
  await expect(dialog.getByRole("button", { name: "Ablehnen" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Ist leider aus" }).click();
  await dialog.getByRole("button", { name: "Ablehnen" }).click();
  await expect(card).toBeHidden();

  await expect(phone.getByText("Abgelehnt: Ist leider aus")).toBeVisible({ timeout: 15_000 });
});

test("Küchen-Leiste: Schalter da, Hinweis nur ohne bestellbares Essen", async ({ page }) => {
  await openTheke(page);
  await page.getByRole("button", { name: /^Küche/ }).click();
  const sheet = page.getByRole("dialog", { name: "Küche & Handy-Bestellungen" });
  await expect(sheet.getByRole("switch", { name: "Küche offen" })).toBeVisible();
  // Beispiel-Essen ist bestellbar → kein Hinweis
  await expect(sheet.getByText("Noch kein Essen ist per Handy bestellbar")).toBeHidden();
  await expect(sheet.getByText("Keine offenen Bestellungen.").or(sheet.getByTestId("theke-bestellung").first())).toBeVisible();
});
