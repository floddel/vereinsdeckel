import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { articleId, createMemberWithLink, openVerwaltung, sendOps, shot } from "../helpers";

test("Abendabschluss: Umsatz, Zahlungen, Trinkgeld, Storno, Rohgewinn – Abend benennen", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const { id, url } = await createMemberWithLink(page, `Abend-Gast ${p}`);
  const pils = await articleId(page, "Pils 0,33");
  const saleId = randomUUID();
  const lineId = randomUUID();
  const now = new Date().toISOString();
  await sendOps(page, [
    {
      type: "sale",
      id: saleId,
      memberId: id,
      createdAt: now,
      lines: [{ id: lineId, articleId: pils.id, articleName: "Pils 0,33", quantity: 3, unitPriceCents: pils.priceCents, isGuest: false }],
    },
    { type: "reversal", id: randomUUID(), saleId, createdAt: now, reason: "Versehen", lines: [{ lineId, quantity: 1 }] },
    { type: "payment", id: randomUUID(), memberId: id, createdAt: now, methodId: "cash", amountCents: 2 * pils.priceCents, tipCents: 50, cashGivenCents: null, saleId: null },
  ]);

  await openVerwaltung(page, "/verwaltung/abende");
  const first = page.getByTestId("abende").getByRole("row").nth(1);
  await first.getByRole("link").click();
  await expect(page.getByRole("heading", { name: /^Abendabschluss / })).toBeVisible();
  await expect(page.getByTestId("abend-umsatz")).toContainText("€");
  await expect(page.getByTestId("abend-trinkgeld")).toContainText("€");
  await expect(page.getByTestId("zahlungen")).toContainText("Bar");
  await expect(page.getByTestId("artikel-auswertung")).toContainText("Pils 0,33");
  await expect(page.getByTestId("abend-stornos")).toContainText(`Abend-Gast ${p} · 1× Pils 0,33`);

  await page.getByLabel("Name des Abends (optional)").fill(`Sommerfest ${p}`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByText("Gespeichert")).toBeVisible();
  await shot(page, "abendabschluss", p);
  const day = page.url().split("/").at(-1)!;
  await page.getByRole("button", { name: "Alle Abende" }).click();
  await expect(page.getByTestId("abende")).toContainText(`Sommerfest ${p}`);

  // PDFs: Abendabschluss, Kassenbuch, Kontoauszug (Verwaltung) und Kassenzettel (Mitglied über den Link)
  const pdf = async (path: string) => {
    const res = await page.request.get(path);
    expect(res.status(), path).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");
    expect((await res.body()).subarray(0, 5).toString()).toBe("%PDF-");
  };
  await pdf(`/api/pdf/abend/${day}`);
  await pdf(`/api/kassenbuch/pdf?topf=cash`);
  await pdf(`/api/pdf/konto/${id}?von=2026-01-01&bis=${day}`);
  await pdf(`/api/m/${url.split("/").at(-1)}/zettel/${day}`);
  // Konto-Karte beim Mitglied
  await page.goto(`/verwaltung/mitglieder/${id}`);
  await expect(page.getByTestId("konto")).toContainText("Offen");
  await expect(page.getByRole("button", { name: "Kontoauszug (PDF)" })).toBeVisible();
});

test("PDFs und Exporte der Verwaltung nur mit Anmeldung", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  for (const path of ["/api/pdf/abend/2026-10-15", "/api/kassenbuch/pdf", `/api/pdf/konto/${randomUUID()}`, "/api/export/buchungen", "/api/export/mitglieder"]) {
    expect((await ctx.request.get(path)).status(), path).toBe(401);
  }
  expect((await ctx.request.get("/api/m/falscher-link/zettel/2026-10-15")).status()).toBe(404);
  await ctx.close();
});

test("Kassenzettel-PDF über den Mitgliederlink wird gebremst", async ({ page }, testInfo) => {
  // Einmal reicht; die Bremse zählt auch für alle Mitglieder zusammen.
  test.skip(testInfo.project.name !== "desktop", "nur auf dem Desktop");
  const { id, url } = await createMemberWithLink(page, `PDF-Bremse ${testInfo.project.name}`);
  const pils = await articleId(page, "Pils 0,33");
  await sendOps(page, [
    {
      type: "sale",
      id: randomUUID(),
      memberId: id,
      createdAt: new Date().toISOString(),
      lines: [{ id: randomUUID(), articleId: pils.id, articleName: "Pils 0,33", quantity: 1, unitPriceCents: pils.priceCents, isGuest: false }],
    },
  ]);
  const zettel = await page.request.get(`/api/m/${url.split("/").at(-1)}/zettel`);
  const day = ((await zettel.json()) as { receipts: { businessDate: string }[] }).receipts[0].businessDate;
  const path = `/api/m/${url.split("/").at(-1)}/zettel/${day}`;
  for (let i = 0; i < 10; i++) expect((await page.request.get(path)).status(), `Abruf ${i + 1}`).toBe(200);
  const blocked = await page.request.get(path);
  expect(blocked.status()).toBe(429);
  expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(0);
  expect(await blocked.text()).toContain("bitte kurz warten");
});

test("Früherer Abend: Storno, Umbuchen und Zahlungs-Storno in der Verwaltung", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const klaus = await createMemberWithLink(page, `Nachträglich ${p}`);
  const peter = await createMemberWithLink(page, `Richtig ${p}`);
  const pils = await articleId(page, "Pils 0,33");
  // Vor drei Tagen, 20 Uhr in Berlin
  const at = new Date(Date.now() - 3 * 24 * 60 * 60_000);
  at.setUTCHours(18, 0, 0, 0);
  const day = at.toISOString().slice(0, 10);
  const line = (quantity: number) => ({ id: randomUUID(), articleId: pils.id, articleName: "Pils 0,33", quantity, unitPriceCents: pils.priceCents, isGuest: false });
  const first = randomUUID();
  const second = randomUUID();
  await sendOps(page, [
    { type: "sale", id: first, memberId: klaus.id, createdAt: at.toISOString(), lines: [line(3)] },
    { type: "sale", id: second, memberId: klaus.id, createdAt: new Date(at.getTime() + 60_000).toISOString(), lines: [line(1)] },
    { type: "payment", id: randomUUID(), memberId: klaus.id, createdAt: new Date(at.getTime() + 120_000).toISOString(), methodId: "cash", amountCents: pils.priceCents, tipCents: 0, cashGivenCents: null, saleId: null },
  ]);
  // An der Theke (ohne PIN) geht das nicht mehr
  const res = await page.request.post("/api/sync", {
    data: { deviceId: "e2e", ops: [{ type: "reversal", id: randomUUID(), saleId: first, createdAt: new Date().toISOString(), reason: "Test", lines: "all" }] },
    headers: { origin: new URL(page.url()).origin },
  });
  expect(((await res.json()) as { results: { status: string }[] }).results[0].status).toBe("rejected");

  await openVerwaltung(page, `/verwaltung/abende/${day}`);
  const bons = page.getByTestId("abend-bons");
  // Unter Last kann die Eingabe vor dem Laden der Seite ankommen; React übernimmt sie dann nicht und
  // reagiert auch auf denselben Text nicht noch einmal → Feld leeren und neu tippen, bis gefiltert ist
  const search = async (name: string, count: number) =>
    expect(async () => {
      const field = bons.getByLabel("Bons nach Mitglied suchen");
      await field.fill("");
      await field.fill(name);
      await expect(bons.getByTestId("bon")).toHaveCount(count, { timeout: 1500 });
    }).toPass();
  await search(`Nachträglich ${p}`, 2);
  await expect(bons.getByTestId("zahlung")).toHaveCount(1);
  await shot(page, "abend-bons", p);

  // 1 von 3 Pils stornieren
  await bons.getByTestId("bon").filter({ hasText: "3× Pils 0,33" }).getByRole("button", { name: "Storno" }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Pils 0,33 eins weniger" }).click();
  await dialog.getByRole("button", { name: "Pils 0,33 eins weniger" }).click();
  await dialog.getByRole("button", { name: "Falsch getippt" }).click();
  await dialog.getByRole("button", { name: /^Stornieren · / }).click();
  await expect(page.getByText("Storniert", { exact: true })).toBeVisible();
  await expect(bons.getByTestId("bon").filter({ hasText: "(1 storniert)" })).toContainText("teilweise storniert");

  // Den anderen Bon auf das richtige Mitglied umbuchen
  await bons.getByTestId("bon").filter({ hasText: "1× Pils 0,33" }).getByRole("button", { name: "Umbuchen" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Mitglied für Umbuchung suchen").fill(`Richtig ${p}`);
  await dialog.getByRole("button", { name: `Richtig ${p}`, exact: true }).click();
  await dialog.getByRole("button", { name: `Umbuchen auf Richtig ${p}` }).click();
  await expect(page.getByText("Umgebucht", { exact: true })).toBeVisible();

  // Zahlung stornieren
  await bons.getByTestId("zahlung").getByRole("button", { name: "Storno" }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Falsch getippt" }).click();
  await dialog.getByRole("button", { name: /^Zahlung stornieren · / }).click();
  await expect(page.getByText("Zahlung storniert", { exact: true })).toBeVisible();
  await expect(bons.getByTestId("zahlung")).toContainText("storniert");

  // Die Korrekturen zählen zu diesem Abend
  await expect(page.getByTestId("abend-stornos")).toContainText(`Nachträglich ${p} · 1× Pils 0,33`);
  await expect(page.getByTestId("abend-stornos")).toContainText(`Umgebucht auf Richtig ${p}`);
  await search(`Richtig ${p}`, 1);

  // Konten: Klaus 2 Pils offen, Peter 1 Pils
  const open = async (id: string) =>
    ((await (await page.request.get("/api/theke/stand")).json()) as { members: { id: string; openCents: number }[] }).members.find((m) => m.id === id)?.openCents;
  expect(await open(klaus.id)).toBe(2 * pils.priceCents);
  expect(await open(peter.id)).toBe(pils.priceCents);
});
