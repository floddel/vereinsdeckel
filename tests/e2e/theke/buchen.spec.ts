import { expect, type Page, test } from "@playwright/test";
import { ADMIN } from "../fixtures";
import { openVerwaltung, shot } from "../helpers";

/** Jedes Gerät bucht auf eigene Mitglieder, weil alle dieselbe Test-Datenbank nutzen. */
const nachname = (project: string) => ({ "tablet-quer": "Müller", "tablet-hoch": "Schmidt", desktop: "Weiß" })[project] ?? "Becker";

async function openTheke(page: Page) {
  await page.goto("/theke");
  await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toBeVisible();
  // Bis die Seite im Browser fertig ist, ist sie gesperrt – sonst gehen getippte Buchstaben verloren
  await expect(page.locator("[inert]")).toHaveCount(0);
}

const memberButton = (page: Page, name: string) =>
  page.getByRole("main").getByRole("button", { name: new RegExp(`^${name}`) }).first();

async function expectSaved(page: Page) {
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "ok");
}

test("Ein Bier für Klaus in 3 Tipps – und es bleibt gespeichert", async ({ page }, testInfo) => {
  const klaus = `Klaus ${nachname(testInfo.project.name)}`;
  await openTheke(page);
  await shot(page, "theke-auswahl", testInfo.project.name);

  await memberButton(page, klaus).click(); // ① Mitglied
  await expect(page.getByTestId("theke-member")).toHaveText(klaus);
  await shot(page, "theke-mitglied", testInfo.project.name);
  await page.getByRole("button", { name: /^Pils 0,33,/ }).click(); // ② Kachel
  await page.getByRole("button", { name: /^Anschreiben/ }).click(); // ③ Anschreiben

  await expect(page.getByRole("status").filter({ hasText: `1× Pils 0,33 für ${klaus} angeschrieben` })).toBeVisible();
  await expectSaved(page);

  // Nach dem Neuladen: Klaus ist „heute da“ mit 2,00 € offen
  await page.reload();
  await expect(memberButton(page, klaus)).toContainText("2,00 € offen");
  await memberButton(page, klaus).click();
  await expect(page.getByTestId("theke-open")).toHaveText("2,00 €");
});

test("Warenkorb mit Mengen, Gast, Limit-Warnung und Rückgängig", async ({ page }, testInfo) => {
  const peter = `Peter ${nachname(testInfo.project.name)}`;
  await openTheke(page);
  await page.getByRole("searchbox", { name: "Mitglied suchen" }).fill(peter.slice(0, 7));
  await memberButton(page, peter).click();

  const weizen = page.getByRole("button", { name: /^Weizen 0,5,/ });
  for (let i = 0; i < 3; i++) await weizen.click();
  const cart = page.getByRole("complementary", { name: "Warenkorb" });
  await expect(cart).toContainText("3× Weizen 0,5");
  await cart.getByRole("button", { name: "Weizen 0,5 eins weniger" }).click();
  await expect(cart).toContainText("2× Weizen 0,5");

  // Gast: eigene Position mit Hinweis
  await cart.getByRole("switch", { name: "Für einen Gast" }).click();
  await page.getByRole("button", { name: /^Bratwurst,/ }).click();
  await expect(cart).toContainText("1× Bratwurst");
  await expect(cart).toContainText("Gast");

  // Viel Weizen → über dem Warnlimit
  for (let i = 0; i < 10; i++) await cart.getByRole("button", { name: "Weizen 0,5 eins mehr" }).click();
  await expect(page.getByRole("status").filter({ hasText: /ans Bezahlen erinnern/ })).toBeVisible();
  await shot(page, "theke-warenkorb", testInfo.project.name);

  await page.getByRole("button", { name: /^Anschreiben/ }).click();
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await expect(page.getByText("Rückgängig gemacht")).toBeVisible();
  await expectSaved(page);

  await page.reload();
  await memberButton(page, peter).click();
  await expect(page.getByTestId("theke-open")).toHaveText("0,00 €");
});

test("Tastatur: suchen, wählen, anschreiben, zurück", async ({ page, isMobile }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop" || isMobile, "Tastatursteuerung nur am Desktop");
  await openTheke(page);

  await page.keyboard.type("horst ");
  const results = page.getByRole("main").getByRole("button");
  await expect(results.first()).toHaveAttribute("data-active", "true");
  await page.keyboard.press("ArrowDown");
  await expect(results.nth(1)).toHaveAttribute("data-active", "true");
  const name = (await results.nth(1).innerText()).split("\n")[0];
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("theke-member")).toHaveText(name);

  await page.getByRole("button", { name: /^Kaffee,/ }).click();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status").filter({ hasText: `1× Kaffee für ${name} angeschrieben` })).toBeVisible();

  // „/“ fokussiert die Suche, Esc leert sie
  await page.keyboard.press("/");
  await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toBeFocused();
  await page.keyboard.type("uwe");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toHaveValue("");
});

test("Netz weg: Buchung wartet und wird danach genau einmal gespeichert", async ({ page, context }, testInfo) => {
  const hans = `Hans ${nachname(testInfo.project.name)}`;
  await openTheke(page);
  await memberButton(page, hans).click();

  await context.setOffline(true);
  await page.getByRole("button", { name: /^Cola,/ }).click();
  await page.getByRole("button", { name: /^Anschreiben/ }).click();
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "offline");
  // offener Betrag ist trotzdem sofort richtig
  await memberButton(page, hans).click();
  await expect(page.getByTestId("theke-open")).toHaveText("1,50 €");
  await page.getByRole("button", { name: "Zurück zur Auswahl" }).click();

  await context.setOffline(false);
  await expectSaved(page);
  await page.reload();
  await memberButton(page, hans).click();
  await expect(page.getByTestId("theke-open")).toHaveText("1,50 €");
});

test("Neues Mitglied aus der Verwaltung erscheint an der Theke ohne Neuladen", async ({ page }, testInfo) => {
  const name = `Neu Gast ${testInfo.project.name}`;
  await openTheke(page);

  // Zahnrad → Verwaltung (Seitenwechsel ohne Neuladen; die Theke bleibt im Hintergrund erhalten)
  await page.getByRole("link", { name: "Verwaltung" }).click();
  await page.getByLabel("PIN").fill(ADMIN.pin);
  await page.getByRole("button", { name: "Entsperren" }).click();
  await expect(page).toHaveURL(/\/verwaltung$/);

  const menu = page.getByRole("button", { name: "Menü öffnen" });
  const nav = async (link: string) => {
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: link }).click();
  };
  await nav("Mitglieder");
  await page.getByRole("button", { name: "Neues Mitglied" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();

  await nav("Zur Theke");
  await expect(page).toHaveURL(/\/theke$/);
  await page.getByRole("searchbox", { name: "Mitglied suchen" }).fill("neu gast");
  await expect(memberButton(page, name)).toBeVisible();
});

test("Nur verkaufen, was da ist: leer ausgegraut, Rest auf der Kachel", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const pfeffi = `Pfeffi ${p}`;
  const klaus = `Klaus ${nachname(p)}`;
  // Neuer Artikel mit Notiz – noch nichts eingekauft
  await openVerwaltung(page, "/verwaltung/artikel");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  await dialog.getByLabel("Name").fill(pfeffi);
  await dialog.getByLabel("Vereinspreis (€)").fill("1");
  await dialog.getByLabel("Notiz (nur für die Verwaltung, optional)").fill("Berliner Luft, Nordbrand");
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("main").getByRole("listitem").filter({ hasText: pfeffi })).toContainText("Berliner Luft, Nordbrand");

  await openTheke(page);
  await memberButton(page, klaus).click();
  const tile = page.getByRole("button", { name: new RegExp(`^${pfeffi},`) });
  await expect(tile).toHaveAccessibleName(`${pfeffi}, 1,00 €, leer`);
  await expect(tile).toBeDisabled(); // aria-disabled: antippen zeigt nur einen Hinweis
  await tile.click({ force: true });
  await expect(page.getByText(`${pfeffi}: nichts mehr da`)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Warenkorb" })).not.toContainText(pfeffi);

  // 2 Stück einkaufen → „noch 2“, mehr geht nicht in den Warenkorb
  await page.goto("/verwaltung/einkaeufe/neu");
  await page.waitForLoadState("networkidle"); // Eingaben vor dem Laden der Skripte gingen verloren
  await page.getByLabel("Artikel").first().selectOption({ label: pfeffi });
  await page.getByLabel("Stück").first().fill("2");
  await page.getByLabel("Preis gesamt (€)").first().fill("1");
  await page.getByRole("button", { name: /^Einkauf speichern/ }).click();
  await expect(page).toHaveURL(/\/verwaltung\/einkaeufe$/);

  await openTheke(page);
  await memberButton(page, klaus).click();
  await expect(tile.getByTestId("kachel-bestand")).toHaveText("noch 2");
  await tile.click();
  await tile.click();
  await expect(tile.getByTestId("kachel-bestand")).toHaveText("noch 0");
  await expect(page.getByRole("button", { name: `${pfeffi} eins mehr` })).toBeDisabled();
  await expect(tile).toBeDisabled();
  await tile.click({ force: true });
  await expect(page.getByText(`${pfeffi}: nichts mehr da`)).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Warenkorb" })).toContainText(`2× ${pfeffi}`);
  await shot(page, "theke-bestand", p);
});
