import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { articleId, createMemberWithLink, isRealConsoleError, openVerwaltung, sendOps, shot } from "../helpers";

const now = () => new Date().toISOString();

async function beer(page: Page, memberId: string, quantity: number) {
  const pils = await articleId(page, "Pils 0,33");
  await sendOps(page, [
    {
      type: "sale",
      id: randomUUID(),
      memberId,
      createdAt: now(),
      lines: [{ id: randomUUID(), articleId: pils.id, articleName: "Pils 0,33", quantity, unitPriceCents: pils.priceCents, isGuest: false }],
    },
  ]);
}

test("Live-Bierdeckel: neue Striche ohne Neuladen, dann beglichen", async ({ page, context }, testInfo) => {
  const { id, url } = await createMemberWithLink(page, `Handy Live ${testInfo.project.name}`);

  const phone = await context.newPage();
  const errors: string[] = [];
  phone.on("console", (m) => m.type() === "error" && isRealConsoleError(m.text()) && errors.push(m.text()));
  phone.on("pageerror", (e) => isRealConsoleError(e.message) && errors.push(e.message));
  await phone.goto(url);
  await expect(phone.getByRole("heading", { name: `Hallo Handy Live ${testInfo.project.name}!` })).toBeVisible();
  await expect(phone.getByTestId("status")).toHaveText("Noch nichts auf dem Deckel.");

  // An der Theke werden 3 Pils angeschrieben – das Handy zeigt sie von selbst
  await beer(page, id, 3);
  await expect(phone.getByRole("img", { name: "Bier: 3 Striche" })).toBeVisible({ timeout: 15_000 });
  await expect(phone.getByTestId("offen")).toHaveText("6,00 €");
  await beer(page, id, 4);
  await expect(phone.getByRole("img", { name: "Bier: 7 Striche" })).toBeVisible({ timeout: 15_000 });
  await phone.waitForTimeout(2500); // Zeichnen-Animation abwarten
  await shot(phone, "bierdeckel", testInfo.project.name);

  // Bezahlt an der Theke → beglichen
  await sendOps(page, [
    { type: "payment", id: randomUUID(), memberId: id, createdAt: now(), methodId: "cash", amountCents: 1400, tipCents: 0, cashGivenCents: null, saleId: null },
  ]);
  await expect(phone.getByTestId("status")).toHaveText("Alles bezahlt – Prost!", { timeout: 15_000 });
  await shot(phone, "bierdeckel-beglichen", testInfo.project.name);
  expect(errors).toEqual([]);
});

test("Pflichttest: keine fremden Daten, gesperrter oder falscher Link zeigt nichts", async ({ page, context }, testInfo) => {
  const p = testInfo.project.name;
  const klaus = await createMemberWithLink(page, `Pflicht Klaus ${p}`);
  const peter = await createMemberWithLink(page, `Pflicht Peter ${p}`);
  await beer(page, klaus.id, 2);
  await beer(page, peter.id, 5);

  // Klaus' Seite (ohne Anmeldung) enthält nichts von Peter
  const anon = await context.browser()!.newContext();
  const phone = await anon.newPage();
  const res = await phone.goto(klaus.url);
  expect(res?.headers()["referrer-policy"]).toBe("no-referrer");
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(phone.getByRole("img", { name: "Bier: 2 Striche" })).toBeVisible();
  const html = await phone.content();
  expect(html).not.toContain(`Pflicht Peter ${p}`);
  expect(html).not.toContain(peter.id);
  expect(html).not.toContain(peter.url);
  const api = await phone.request.get(`/api${klaus.url}/stand`);
  expect(await api.text()).not.toContain("Peter");

  // eigenes App-Manifest
  const manifestHref = await phone.locator('link[rel="manifest"]').getAttribute("href");
  expect(manifestHref).toBe(`${klaus.url}/manifest.webmanifest`);
  const manifest = await (await phone.request.get(manifestHref!)).json();
  expect(manifest.start_url).toBe(klaus.url);
  // auch auf den Unterseiten: eigenes Symbol „Bierdeckel“, nie die Theke
  for (const sub of ["bestellen", "zettel", "uebersicht"]) {
    await phone.goto(`${klaus.url}/${sub}`);
    expect(await phone.locator('link[rel="manifest"]').getAttribute("href")).toBe(`${klaus.url}/manifest.webmanifest`);
    expect(await phone.locator('meta[name="apple-mobile-web-app-title"]').getAttribute("content")).toBe("Bierdeckel");
  }

  // erfundener Link → neutrale Meldung, Schnittstelle 404
  const fake = `/m/${"A".repeat(43)}`;
  await phone.goto(fake);
  await expect(phone.getByTestId("link-ungueltig")).toBeVisible();
  expect((await phone.request.get(`/api${fake}/stand`)).status()).toBe(404);

  // Link sperren → alter Link zeigt dasselbe wie ein falscher
  await openVerwaltung(page, `/verwaltung/mitglieder/${klaus.id}`);
  await page.getByRole("button", { name: "Link sperren" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Sperren" }).click();
  await expect(page.getByText("Der Link ist gesperrt")).toBeVisible();
  await phone.goto(klaus.url);
  await expect(phone.getByTestId("link-ungueltig")).toBeVisible();
  expect(await phone.content()).not.toContain(`Pflicht Klaus ${p}`);
  expect((await phone.request.get(`/api${klaus.url}/stand`)).status()).toBe(404);
  expect((await phone.request.get(`${klaus.url}/manifest.webmanifest`)).status()).toBe(404);
  await anon.close();
});
