import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { articleId, createMemberWithLink, sendOps, shot } from "../helpers";

test("Mitglied antippen zeigt, was auf dem Deckel steht – auch von früheren Abenden", async ({ page }, testInfo) => {
  const name = `Deckel ${testInfo.project.name}`;
  const { id } = await createMemberWithLink(page, name);
  const pils = await articleId(page, "Pils 0,33");
  const wurst = await articleId(page, "Bratwurst");
  const yesterday = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const sale = (a: { id: string; priceCents: number }, articleName: string, quantity: number, createdAt: string) => ({
    type: "sale",
    id: randomUUID(),
    memberId: id,
    createdAt,
    lines: [{ id: randomUUID(), articleId: a.id, articleName, quantity, unitPriceCents: a.priceCents, isGuest: false }],
  });
  // gestern: 3 Pils, davon 2,00 € angezahlt
  await sendOps(page, [
    sale(pils, "Pils 0,33", 3, yesterday),
    { type: "payment", id: randomUUID(), memberId: id, createdAt: yesterday, methodId: "cash", amountCents: 200, tipCents: 0, cashGivenCents: null, saleId: null },
  ]);
  // heute: 1 Bratwurst
  await sendOps(page, [sale(wurst, "Bratwurst", 1, new Date().toISOString())]);

  await page.goto("/theke");
  await page.getByRole("searchbox", { name: "Mitglied suchen" }).fill(name);
  await page.getByRole("main").getByRole("button", { name: new RegExp(`^${name}`) }).first().click();

  const deckel = page.getByTestId("auf-dem-deckel");
  await expect(deckel).toContainText("Auf dem Deckel 7,00 €");
  await expect(deckel).toContainText("Heute1× Bratwurst3,00 €");
  await expect(deckel).toContainText("3× Pils 0,336,00 €");
  await expect(deckel).toContainText("Schon bezahlt−2,00 €");
  // neuester Abend zuerst
  expect((await deckel.innerText()).indexOf("Heute")).toBeLessThan((await deckel.innerText()).indexOf("Pils"));
  await shot(page, "theke-auf-dem-deckel", testInfo.project.name);

  // gleich anschreiben → steht sofort mit auf dem Deckel
  await page.getByRole("button", { name: /^Pils 0,33,/ }).click();
  await page.getByRole("button", { name: /^Anschreiben/ }).click();
  await page.getByRole("main").getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await expect(deckel).toContainText("Heute1× Bratwurst3,00 €1× Pils 0,332,00 €");
  await expect(deckel).toContainText("Auf dem Deckel 9,00 €");

  // alles bezahlt → nichts mehr auf dem Deckel
  await sendOps(page, [
    { type: "payment", id: randomUUID(), memberId: id, createdAt: new Date().toISOString(), methodId: "cash", amountCents: 900, tipCents: 0, cashGivenCents: null, saleId: null },
  ]);
  await page.reload();
  await page.getByRole("searchbox", { name: "Mitglied suchen" }).fill(name);
  await page.getByRole("main").getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await expect(page.getByTestId("theke-open")).toHaveText("0,00 €");
  await expect(deckel).toBeHidden();
});
