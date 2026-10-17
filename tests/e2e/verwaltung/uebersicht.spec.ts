import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { articleId, createMemberWithLink, openVerwaltung, sendOps, shot } from "../helpers";

test("Übersicht: Töpfe, Auslagen, Warenwert, offene Beträge und Nachkaufen", async ({ page }, testInfo) => {
  const name = `Großer Durst ${testInfo.project.name}`;
  const { id } = await createMemberWithLink(page, name);
  const pils = await articleId(page, "Pils 0,33");
  // 50 Pils → 100 € offen: über dem Limit und ganz oben in der Liste
  await sendOps(page, [
    {
      type: "sale",
      id: randomUUID(),
      memberId: id,
      createdAt: new Date().toISOString(),
      lines: [{ id: randomUUID(), articleId: pils.id, articleName: "Pils 0,33", quantity: 50, unitPriceCents: pils.priceCents, isGuest: false }],
    },
  ]);

  await openVerwaltung(page, "/verwaltung");
  await expect(page.getByTestId("kpi-cash")).toContainText("Handkasse");
  await expect(page.getByTestId("kpi-paypal")).toContainText("PayPal");
  await expect(page.getByTestId("kpi-auslagen")).toContainText("Deine Auslagen");
  await expect(page.getByTestId("kpi-offen")).toContainText(/Offen bei \d+ Mitglied/);
  await expect(page.getByTestId("kpi-warenwert")).toContainText("Warenwert im Lager");
  const row = page.getByTestId("offene-betraege").getByRole("link", { name: new RegExp(name) });
  await expect(row).toContainText("100,00 €");
  await expect(row.getByLabel("über dem Limit")).toBeVisible();
  // Chips haben im Beispiel keinen Bestand
  await expect(page.getByTestId("nachkaufen")).toContainText("Chips");
  await shot(page, "uebersicht-verwaltung", testInfo.project.name);

  await row.click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
});
