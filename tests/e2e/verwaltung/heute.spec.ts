import { expect, test } from "@playwright/test";
import { NO_AUTH } from "../fixtures";
import { openVerwaltung, shot } from "../helpers";

// Tipp des Hauses gilt für alle Geräte: nacheinander laufen lassen.
test.describe.configure({ mode: "serial" });

test("Heute: selbst Gekochtes und Tipp des Hauses – öffentliche Karte und Theke", async ({ page, browser }, testInfo) => {
  const p = testInfo.project.name;
  const dish = `Eintopf ${p}`;
  await openVerwaltung(page, "/verwaltung/heute");

  // Neues Gericht, gleich für heute
  const specials = page.getByTestId("selbst-gekocht");
  // Gibt es schon Gerichte (andere Geräte), steht dort der Knopf – sonst gleich das Formular
  const newDish = specials.getByRole("button", { name: "Neues Gericht" });
  await expect(newDish.or(specials.getByLabel("Gericht"))).toBeVisible();
  if (await newDish.isVisible()) await newDish.click();
  await specials.getByLabel("Gericht").fill(dish);
  await specials.getByLabel("Preis (€)").fill("4,50");
  await specials.getByLabel("Beschreibung für die Karte (optional)").fill("Linsen mit Mettwurst, dazu Brot");
  await specials.getByRole("button", { name: "Gericht anlegen" }).click();
  await expect(page.getByText(`${dish} angelegt`)).toBeVisible();
  await expect(specials.getByRole("listitem").filter({ hasText: dish })).toContainText("heute im Angebot");

  // Tipp des Hauses: Vorschlag aus „steht schon lange da“
  const tip = page.getByTestId("tipp");
  const suggestion = tip.getByRole("button").first();
  const tipName = (await suggestion.locator("span").first().innerText()).trim();
  await suggestion.click();
  await tip.getByLabel("Spruch (optional)").fill("Muss weg – heute gern ein Gläschen!");
  await tip.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Tipp des Hauses gespeichert")).toBeVisible();
  await shot(page, "heute", p);

  // Öffentliche Karte – ohne Anmeldung
  const guest = await browser.newContext({ storageState: NO_AUTH });
  const phone = await guest.newPage();
  await phone.goto("/karte");
  await expect(phone.getByRole("heading", { name: "Was gibt's heute?" })).toBeVisible();
  const fresh = phone.getByTestId("frisch-gekocht").filter({ hasText: dish });
  await expect(fresh).toContainText("Linsen mit Mettwurst, dazu Brot");
  await expect(fresh).toContainText("4,50 €");
  await expect(phone.getByTestId("tipp-des-hauses")).toContainText(tipName);
  await expect(phone.getByTestId("tipp-des-hauses")).toContainText("Muss weg – heute gern ein Gläschen!");
  await expect(phone.getByText("vorne am Tresen")).toBeVisible();
  await shot(phone, "karte", p);
  await phone.getByRole("link", { name: "So funktioniert's →" }).click();
  await expect(phone.getByRole("heading", { name: "Dein Bierdeckel aufs Handy" })).toBeVisible();
  await expect(phone.getByText("Das Handy ist freiwillig.")).toBeVisible();

  // Theke hat das Gericht heute
  const stand = async () => ((await (await page.request.get("/api/theke/stand")).json()) as { articles: { name: string }[] }).articles.map((a) => a.name);
  expect(await stand()).toContain(dish);

  // Für heute ausschalten → weg von Karte und Theke
  await specials.getByRole("switch", { name: `${dish} heute anbieten` }).click();
  await expect(page.getByText(`${dish} ist für heute raus`)).toBeVisible();
  await phone.goto("/karte");
  await expect(phone.getByRole("heading", { name: "Was gibt's heute?" })).toBeVisible();
  await expect(phone.getByTestId("frisch-gekocht").filter({ hasText: dish })).toHaveCount(0);
  expect(await stand()).not.toContain(dish);
  await guest.close();

  // Tipp wieder entfernen (für die anderen Geräte)
  await tip.getByLabel("Artikel").selectOption("");
  await tip.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Kein Tipp mehr auf der Karte")).toBeVisible();
});

test("Aufsteller: QR-Code zur Karte, auf beiden Seiten", async ({ page }) => {
  await openVerwaltung(page, "/verwaltung/heute/aufsteller");
  const halves = page.getByTestId("aufsteller");
  await expect(halves).toHaveCount(2);
  await expect(halves.first().getByRole("img", { name: "QR-Code zur Karte" })).toBeVisible();
  await expect(halves.last()).toContainText("/karte");
  await expect(halves.last()).toContainText("Frag vorne nach deinem persönlichen QR-Code");
});
