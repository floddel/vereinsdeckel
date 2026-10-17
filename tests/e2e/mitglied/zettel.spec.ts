import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { articleId, createMemberWithLink, isRealConsoleError, sendOps, shot } from "../helpers";

test("Kassenzettel des Abends, als Bild speichern, persönliche Übersicht", async ({ page, context }, testInfo) => {
  const name = `Handy Zettel ${testInfo.project.name}`;
  const { id, url } = await createMemberWithLink(page, name);
  const pils = await articleId(page, "Pils 0,33");
  const at = new Date().toISOString();
  await sendOps(page, [
    {
      type: "sale",
      id: randomUUID(),
      memberId: id,
      createdAt: at,
      lines: [{ id: randomUUID(), articleId: pils.id, articleName: "Pils 0,33", quantity: 2, unitPriceCents: pils.priceCents, isGuest: false }],
    },
    { type: "payment", id: randomUUID(), memberId: id, createdAt: at, methodId: "cash", amountCents: 2 * pils.priceCents, tipCents: 50, cashGivenCents: 1000, saleId: null },
  ]);

  const phone = await context.newPage();
  const errors: string[] = [];
  phone.on("console", (m) => m.type() === "error" && isRealConsoleError(m.text()) && errors.push(m.text()));
  phone.on("pageerror", (e) => isRealConsoleError(e.message) && errors.push(e.message));
  await phone.goto(url);
  await phone.getByRole("link", { name: "Meine Kassenzettel" }).click();
  const zettel = phone.getByTestId("kassenzettel").first();
  await expect(zettel).toContainText("2 x Pils 0,33");
  await expect(zettel).toContainText(`SUMME`);
  await expect(zettel).toContainText("Bar gegeben");
  await expect(zettel).toContainText("Trinkgeld");
  await expect(zettel).toContainText("Offen danach");
  await shot(phone, "kassenzettel", testInfo.project.name);

  const download = phone.waitForEvent("download");
  await phone.getByRole("button", { name: "Als Bild speichern" }).first().click();
  expect((await download).suggestedFilename()).toMatch(/^Kassenzettel-\d{4}-\d{2}-\d{2}\.png$/);

  await phone.getByRole("link", { name: "Mein Bierdeckel" }).click();
  await phone.getByRole("link", { name: "Meine Übersicht" }).click();
  const euro = (pils.priceCents * 2) / 100;
  await expect(phone.getByTestId("monat")).toHaveText(`${euro.toFixed(2).replace(".", ",")} €`);
  await expect(phone.getByRole("listitem").filter({ hasText: "Pils 0,33" })).toContainText("2×");
  await shot(phone, "uebersicht", testInfo.project.name);
  expect(errors).toEqual([]);
});
