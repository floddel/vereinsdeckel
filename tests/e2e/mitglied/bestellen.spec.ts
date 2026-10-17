import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createMemberWithLink, isRealConsoleError, sendOps, shot, thekeOrders } from "../helpers";

test.afterEach(async ({ page }) => {
  await thekeOrders(page, { kitchenOpen: false });
});

test("Essen per Handy bestellen: Küche zu → bestellen → zurückziehen → fertig → abgeholt", async ({ page, context }, testInfo) => {
  const name = `Hungrig ${testInfo.project.name}`;
  const { id, url } = await createMemberWithLink(page, name);
  await thekeOrders(page, { kitchenOpen: false });

  const phone = await context.newPage();
  const errors: string[] = [];
  phone.on("console", (m) => m.type() === "error" && isRealConsoleError(m.text()) && errors.push(m.text()));
  phone.on("pageerror", (e) => isRealConsoleError(e.message) && errors.push(e.message));

  // Küche zu: kein Knopf auf dem Deckel, Bestellseite sagt Bescheid
  await phone.goto(url);
  await expect(phone.getByRole("heading", { name: `Hallo ${name}!` })).toBeVisible();
  await expect(phone.getByRole("link", { name: "Essen bestellen" })).toBeHidden();
  await phone.goto(`${url}/bestellen`);
  await expect(phone.getByRole("heading", { name: "Die Küche ist gerade zu" })).toBeVisible();

  // Theke macht die Küche auf → Speisekarte erscheint von selbst
  await thekeOrders(page, { kitchenOpen: true });
  await expect(phone.getByRole("heading", { name: "Was darf’s sein?" })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByText("Pils 0,33")).toBeHidden(); // Getränke gibt es vorne

  await phone.getByRole("button", { name: "Bratwurst mehr" }).click();
  await phone.getByRole("button", { name: "Bratwurst mehr" }).click();
  await phone.getByLabel("Wunsch (optional)").fill("mit Senf");
  await expect(phone.getByRole("button", { name: "Bestellen · 6,00 €" })).toBeVisible();
  await phone.getByRole("button", { name: /^Bestellen/ }).click();
  await expect(phone.getByText("Bestellung ist raus!")).toBeVisible();
  const card = phone.getByTestId("bestellung").first();
  await expect(card).toContainText("Gesendet");
  await expect(card).toContainText("2× Bratwurst");
  await expect(card).toContainText("„mit Senf“");

  // zweite Bestellung – und gleich wieder zurückziehen
  await phone.getByRole("button", { name: "Fischbrötchen mehr" }).click();
  await phone.getByRole("button", { name: /^Bestellen/ }).click();
  await expect(phone.getByTestId("bestellung")).toHaveCount(2);
  // mehr als 2 offene gehen nicht
  await phone.getByRole("button", { name: "Currywurst mehr" }).click();
  await expect(phone.getByRole("button", { name: /^Bestellen/ })).toBeDisabled();
  await expect(phone.getByText(/schon 2 offene Bestellungen/)).toBeVisible();
  await phone.getByRole("button", { name: "Currywurst weniger" }).click();
  await phone.getByTestId("bestellung").filter({ hasText: "Fischbrötchen" }).getByRole("button", { name: "Zurückziehen" }).click();
  await expect(phone.getByTestId("bestellung")).toHaveCount(1);
  await expect(phone.getByText("Heute erledigt")).toBeVisible();

  // Das Tablet holt die Bestellungen ab → „an der Theke angekommen“
  const mine = (await thekeOrders(page)).orders.filter((o) => o.memberId === id);
  expect(mine).toHaveLength(1);
  const order = mine[0];
  expect(order.note).toBe("mit Senf");
  await expect(card).toContainText("Eingegangen", { timeout: 15_000 });

  await thekeOrders(page, { orderId: order.id, action: "accept" });
  await expect(card).toContainText("Wird zubereitet", { timeout: 15_000 });
  await expect(card.getByRole("button", { name: "Zurückziehen" })).toBeHidden();

  await thekeOrders(page, { orderId: order.id, action: "ready" });
  await expect(card).toContainText("Fertig – bitte abholen!", { timeout: 15_000 });
  await shot(phone, "bestellen-fertig", testInfo.project.name);

  // Bierdeckel zeigt den Hinweis
  await phone.goto(url);
  await expect(phone.getByTestId("bestell-hinweis")).toBeVisible();
  await expect(phone.getByTestId("bestell-hinweis")).toHaveText(/Dein Essen ist fertig/);
  await shot(phone, "bierdeckel-essen-fertig", testInfo.project.name);

  // Abgeholt an der Theke → steht auf dem Deckel, Hinweis verschwindet
  await sendOps(page, [
    {
      type: "sale",
      id: randomUUID(),
      memberId: id,
      createdAt: new Date().toISOString(),
      foodOrderId: order.id,
      lines: order.lines.map((l) => ({ id: randomUUID(), articleId: l.articleId, articleName: l.articleName, quantity: l.quantity, unitPriceCents: l.unitPriceCents, isGuest: false })),
    },
  ]);
  await expect(phone.getByRole("img", { name: "Wurst: 2 Striche" })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByTestId("offen")).toHaveText("6,00 €");
  await expect(phone.getByTestId("bestell-hinweis")).toBeHidden();
  expect(errors).toEqual([]);
});

test("Abgelehnte Bestellung zeigt den Grund und kostet nichts", async ({ page, context }, testInfo) => {
  const { id, url } = await createMemberWithLink(page, `Pech ${testInfo.project.name}`);
  await thekeOrders(page, { kitchenOpen: true });
  const phone = await context.newPage();
  await phone.goto(`${url}/bestellen`);
  await phone.getByRole("button", { name: "Currywurst mehr" }).click();
  await phone.getByRole("button", { name: /^Bestellen/ }).click();
  await expect(phone.getByTestId("bestellung")).toHaveCount(1);

  const order = (await thekeOrders(page)).orders.find((o) => o.memberId === id)!;
  await thekeOrders(page, { orderId: order.id, action: "reject", reason: "Ist leider aus" });
  await expect(phone.getByTestId("bestellung")).toHaveCount(0, { timeout: 15_000 });
  await expect(phone.getByText("Abgelehnt: Ist leider aus")).toBeVisible();
  await phone.goto(url);
  await expect(phone.getByTestId("status")).toHaveText("Noch nichts auf dem Deckel.");
});

test("Gesperrter Link und fremde Seiten können nicht bestellen", async ({ page, context }, testInfo) => {
  const { id, url } = await createMemberWithLink(page, `Gesperrt ${testInfo.project.name}`);
  await thekeOrders(page, { kitchenOpen: true });
  const menu = (await (await page.request.get(`/api${url}/bestellungen`)).json()) as { menu: { id: string }[] };
  const data = { lines: [{ articleId: menu.menu[0].id, quantity: 1 }] };
  const anon = await context.browser()!.newContext({ baseURL: "http://localhost:3100" });
  const own = { origin: "http://localhost:3100" };

  // fremde Seite darf nicht im Namen des Handys bestellen
  expect((await anon.request.post(`/api${url}/bestellungen`, { data, headers: { origin: "https://boese.example" } })).status()).toBe(403);
  // erfundener Link
  expect((await anon.request.post(`/api/m/${"A".repeat(43)}/bestellungen`, { data, headers: own })).status()).toBe(404);
  // Preis kommt nie vom Handy: unbekannte Felder werden ignoriert
  const ok = await anon.request.post(`/api${url}/bestellungen`, {
    data: { lines: [{ ...data.lines[0], unitPriceCents: 1 }] },
    headers: own,
  });
  expect(ok.status()).toBe(201);
  const orderId = ((await ok.json()) as { orders: { id: string }[] }).orders[0].id;

  // Link sperren → weder bestellen noch zurückziehen
  await page.getByRole("button", { name: "Link sperren" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sperren" }).click();
  await expect(page.getByText("Der Link ist gesperrt")).toBeVisible();
  expect((await anon.request.post(`/api${url}/bestellungen`, { data, headers: own })).status()).toBe(404);
  expect((await anon.request.delete(`/api${url}/bestellungen/${orderId}`, { headers: own })).status()).toBe(404);
  expect((await anon.request.get(`/api${url}/bestellungen`)).status()).toBe(404);
  expect((await thekeOrders(page)).orders.filter((o) => o.memberId === id)).toHaveLength(1);
  await anon.close();
});
