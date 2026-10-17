import { expect, type Page, test } from "@playwright/test";
import { openVerwaltung, shot } from "../helpers";

/** Eigene Mitglieder je Gerät (gemeinsame Test-Datenbank). */
const nachname = (project: string) => ({ "tablet-quer": "Müller", "tablet-hoch": "Schmidt", desktop: "Weiß" })[project] ?? "Becker";

const memberButton = (page: Page, name: string) =>
  page.getByRole("main").getByRole("button", { name: new RegExp(`^${name}`) }).first();

async function select(page: Page, name: string) {
  await page.getByRole("searchbox", { name: "Mitglied suchen" }).fill(name);
  await memberButton(page, name).click();
  await expect(page.getByTestId("theke-member")).toHaveText(name);
}

async function book(page: Page, name: string, article: RegExp, times: number) {
  await select(page, name);
  for (let i = 0; i < times; i++) await page.getByRole("button", { name: article }).click();
  await page.getByRole("button", { name: /^Anschreiben/ }).click();
}

const saved = (page: Page) => expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "ok");

test("Bar bezahlen mit „Stimmt so“ → beglichen", async ({ page }, testInfo) => {
  const name = `Dieter ${nachname(testInfo.project.name)}`;
  await page.goto("/theke");
  await book(page, name, /^Weizen 0,5,/, 3);
  await select(page, name);
  await expect(page.getByTestId("theke-open")).toHaveText("9,00 €");

  await page.getByRole("button", { name: "Bezahlen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bezahlen" });
  await dialog.getByRole("button", { name: "10,00 €", exact: true }).click();
  await expect(dialog.getByTestId("rueckgeld")).toContainText("1,00 €");
  await dialog.getByRole("button", { name: "Stimmt so" }).click();
  await expect(dialog.getByTestId("rueckgeld")).toContainText("0,00 €");
  await expect(dialog.getByTestId("rueckgeld")).toContainText("1,00 € Trinkgeld");
  await shot(page, "theke-bezahlen-bar", testInfo.project.name);
  await dialog.getByRole("button", { name: /^Bar kassiert/ }).click();

  await expect(page.getByText(`${name}: beglichen – Prost!`)).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(memberButton(page, name)).toContainText("beglichen");
  await memberButton(page, name).click();
  await expect(page.getByTestId("theke-open")).toHaveText("0,00 €");
  await expect(page.getByTestId("beglichen")).toBeVisible();
  await expect(page.getByTestId("zahlung").first()).toContainText("1,00 € Trinkgeld");
});

test("Teilzahlung und Zahlungs-Storno", async ({ page }, testInfo) => {
  const name = `Uwe ${nachname(testInfo.project.name)}`;
  await page.goto("/theke");
  await book(page, name, /^Weizen 0,5,/, 8);
  await select(page, name);

  await page.getByRole("button", { name: "Bezahlen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bezahlen" });
  await dialog.getByRole("button", { name: "20,00 €", exact: true }).click();
  await expect(dialog).toContainText("danach noch 4,00 € offen");
  await dialog.getByRole("button", { name: "Passend" }).click();
  await dialog.getByRole("button", { name: /^Bar kassiert · 20,00 €/ }).click();
  await saved(page);

  await select(page, name);
  await expect(page.getByTestId("theke-open")).toHaveText("4,00 €");
  const zahlung = page.getByTestId("zahlung").first();
  await zahlung.getByRole("button", { name: "Storno" }).click();
  const storno = page.getByRole("dialog", { name: "Zahlung stornieren" });
  await expect(storno.getByRole("button", { name: /^Zahlung stornieren/ })).toBeDisabled();
  await storno.getByRole("button", { name: "Falsch getippt" }).click();
  await storno.getByRole("button", { name: /^Zahlung stornieren/ }).click();

  await expect(page.getByTestId("theke-open")).toHaveText("24,00 €");
  await expect(zahlung).toContainText("storniert");
  await saved(page);
  await page.reload();
  await select(page, name);
  await expect(page.getByTestId("theke-open")).toHaveText("24,00 €");
});

test("PayPal: QR-Code mit Betrag, Bestätigung nötig", async ({ page }, testInfo) => {
  // PayPal.me-Name eintragen (sonst bietet die Theke kein PayPal an)
  await openVerwaltung(page, "/verwaltung/einstellungen");
  await page.getByLabel("PayPal.me-Name").fill("AngelvereinTest");
  await page.getByRole("button", { name: "Einstellungen speichern" }).click();
  await expect(page.getByText("Einstellungen gespeichert")).toBeVisible();

  const name = `Jürgen ${nachname(testInfo.project.name)}`;
  await page.goto("/theke");
  await book(page, name, /^Fischbrötchen,/, 1);
  await select(page, name);
  await page.getByRole("button", { name: "Bezahlen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Bezahlen" });
  await dialog.getByRole("radio", { name: "PayPal" }).click();
  await expect(dialog.getByRole("img", { name: "PayPal-QR-Code" })).toBeVisible();
  await expect(dialog.getByTestId("paypal-link")).toHaveText("https://paypal.me/AngelvereinTest/3.50EUR");
  await shot(page, "theke-bezahlen-paypal", testInfo.project.name);

  const confirm = dialog.getByRole("button", { name: /^PayPal-Eingang bestätigen/ });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Ich sehe den Eingang in der PayPal-App" }).check();
  await confirm.click();
  await saved(page);
  await select(page, name);
  await expect(page.getByTestId("theke-open")).toHaveText("0,00 €");
  await expect(page.getByTestId("zahlung").first()).toContainText("PayPal bezahlt");
});

test("Sofort bezahlen und Rückgängig hebt Bon und Zahlung auf", async ({ page }, testInfo) => {
  const name = ({ "tablet-quer": "Anni Kramer", "tablet-hoch": "Erika Vogt", desktop: "Ute Lange" } as Record<string, string>)[
    testInfo.project.name
  ];
  await page.goto("/theke");
  await select(page, name);
  await page.getByRole("button", { name: /^Bratwurst,/ }).click();
  await page.getByRole("button", { name: "Sofort bezahlen" }).click();
  const dialog = page.getByRole("dialog", { name: "Sofort bezahlen" });
  await expect(dialog).toContainText("Warenkorb 3,00 €");
  await dialog.getByRole("button", { name: /^Bar kassiert · 3,00 €/ }).click();
  await expect(page.getByRole("status").filter({ hasText: `3,00 € bar von ${name} kassiert` })).toBeVisible();

  await page.getByRole("button", { name: "Rückgängig" }).click();
  await saved(page);
  await page.reload();
  await select(page, name);
  await expect(page.getByTestId("theke-open")).toHaveText("0,00 €");
  await expect(page.getByTestId("bon").first()).toContainText("storniert");
  await expect(page.getByTestId("zahlung").first()).toContainText("storniert");
});
