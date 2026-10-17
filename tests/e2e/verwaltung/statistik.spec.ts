import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { articleId, createMemberWithLink, openVerwaltung, sendOps, shot } from "../helpers";

test("Statistik: Zeitraum, Kennzahlen mit Vergleich, Diagramm, Renner und Ladenhüter", async ({ page }, testInfo) => {
  const p = testInfo.project.name;
  const { id } = await createMemberWithLink(page, `Statistik ${p}`);
  const weizen = await articleId(page, "Weizen 0,5");
  await sendOps(page, [
    {
      type: "sale",
      id: randomUUID(),
      memberId: id,
      createdAt: new Date().toISOString(),
      lines: [{ id: randomUUID(), articleId: weizen.id, articleName: "Weizen 0,5", quantity: 4, unitPriceCents: weizen.priceCents, isGuest: false }],
    },
  ]);

  // eigener Artikel mit Bestand, der nicht verkauft wird → Ladenhüter
  const slow = `Ladenhüter ${p}`;
  await openVerwaltung(page, "/verwaltung/artikel");
  await page.getByRole("button", { name: "Neuer Artikel" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(slow);
  await page.getByRole("dialog").getByLabel("Vereinspreis (€)").fill("1");
  await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/verwaltung/einkaeufe/neu");
  await page.getByLabel("Artikel").first().selectOption({ label: slow });
  await page.getByLabel("Stück").first().fill("5");
  await page.getByLabel("Preis gesamt (€)").first().fill("2,50");
  await page.getByRole("button", { name: /^Einkauf speichern/ }).click();
  await expect(page).toHaveURL(/\/verwaltung\/einkaeufe$/);

  await page.goto("/verwaltung/statistik");
  await expect(page.getByRole("button", { name: "Dieser Monat" })).toHaveAttribute("aria-current", "true");
  await expect(page.getByTestId("stat-umsatz")).toContainText("€");
  await expect(page.getByTestId("stat-abende")).toContainText(/\d/);
  await expect(page.getByRole("img", { name: "Umsatz und Rohgewinn" })).toBeVisible();
  await expect(page.getByTestId("artikel-auswertung")).toContainText("Weizen 0,5");
  await expect(page.getByTestId("ladenhueter")).toContainText(`${slow}5 · 2,50 €`);
  await shot(page, "statistik", p);

  // CSV-Export für den gewählten Zeitraum (Excel: BOM, Semikolon)
  const href = await page.getByTestId("exporte").getByRole("link", { name: "Buchungen (alle Bon-Positionen)" }).getAttribute("href");
  const csv = await page.request.get(href!);
  expect(csv.headers()["content-type"]).toBe("text/csv; charset=utf-8");
  const text = await csv.text();
  expect(text.startsWith("\ufeffAbend;Uhrzeit;Bon;Mitglied;Artikel")).toBe(true);
  expect(text).toContain(`Statistik ${p};Weizen 0,5;Getränke;4;3,00;12,00`);

  await page.getByRole("button", { name: "Letztes Jahr" }).click();
  await expect(page).toHaveURL(/zeitraum=vorjahr/);
  await expect(page.getByTestId("zeitraum")).toContainText("01.01.2025");
  await expect(page.getByTestId("stat-umsatz")).toContainText("0,00 €");

  await page.getByLabel("Von").fill("2026-10-01");
  await page.getByLabel("Bis").fill("2026-12-31");
  await page.getByRole("button", { name: "Anzeigen" }).click();
  await expect(page.getByTestId("zeitraum")).toContainText("01.10.2026 – Do., 31.12.2026");
});
