import { expect, type Page, test } from "@playwright/test";
import { shot } from "../helpers";

/** Eigene Mitglieder je Gerät (gemeinsame Test-Datenbank). */
const nachname = (project: string) => ({ "tablet-quer": "Müller", "tablet-hoch": "Schmidt", desktop: "Weiß" })[project] ?? "Becker";

const memberButton = (page: Page, name: string) =>
  page.getByRole("main").getByRole("button", { name: new RegExp(`^${name}`) }).first();

async function book(page: Page, member: string, article: RegExp, times: number) {
  await page.getByRole("searchbox", { name: "Mitglied suchen" }).fill(member);
  await memberButton(page, member).click();
  for (let i = 0; i < times; i++) await page.getByRole("button", { name: article }).click();
  await page.getByRole("button", { name: /^Anschreiben/ }).click();
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "ok");
}

test("Teil-Storno mit Schnell-Begründung", async ({ page }, testInfo) => {
  const name = `Werner ${nachname(testInfo.project.name)}`;
  await page.goto("/theke");
  await book(page, name, /^Pils 0,33,/, 3);

  await memberButton(page, name).click();
  await expect(page.getByTestId("theke-open")).toHaveText("6,00 €");
  const bon = page.getByTestId("bon").filter({ hasText: "3× Pils 0,33" });
  await bon.getByRole("button", { name: "Storno" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Pils 0,33 eins weniger" }).click();
  await dialog.getByRole("button", { name: "Pils 0,33 eins weniger" }).click();
  // ohne Begründung geht es nicht
  const confirm = dialog.getByRole("button", { name: /^Stornieren/ });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button", { name: "Falsch getippt" }).click();
  await expect(confirm).toHaveText("Stornieren · −2,00 €");
  await shot(page, "theke-storno", testInfo.project.name);
  await confirm.click();

  await expect(page.getByTestId("theke-open")).toHaveText("4,00 €");
  await expect(bon).toContainText("1 storniert");
  await expect(bon).toContainText("Falsch getippt");

  // bleibt nach dem Neuladen
  await page.reload();
  await memberButton(page, name).click();
  await expect(page.getByTestId("theke-open")).toHaveText("4,00 €");
});

test("Umbuchen über die Liste „Heute“", async ({ page }, testInfo) => {
  const from = `Heinz ${nachname(testInfo.project.name)}`;
  const to = `Günter ${nachname(testInfo.project.name)}`;
  await page.goto("/theke");
  await book(page, from, /^Currywurst,/, 1);

  await page.getByRole("button", { name: "Heute" }).click();
  const sheet = page.getByRole("dialog", { name: /^Heute/ });
  const bon = sheet.getByTestId("bon").filter({ hasText: from }).filter({ hasText: "Currywurst" });
  await bon.getByRole("button", { name: "Umbuchen" }).click();

  const dialog = page.getByRole("dialog", { name: "Umbuchen" });
  await dialog.getByRole("searchbox", { name: "Mitglied für Umbuchung suchen" }).fill(to.slice(0, 8));
  await dialog.getByRole("button", { name: to, exact: true }).click();
  await dialog.getByRole("button", { name: `Umbuchen auf ${to}` }).click();
  await expect(page.getByText(`Umgebucht auf ${to}`).first()).toBeVisible();
  await expect(page.getByTestId("sync-status")).toHaveAttribute("data-status", "ok");
  await expect(bon).toContainText("storniert");
  await shot(page, "theke-heute", testInfo.project.name);
  await page.keyboard.press("Escape");

  await page.reload();
  await memberButton(page, from).click();
  await expect(page.getByTestId("theke-open")).toHaveText("0,00 €");
  await page.getByRole("button", { name: "Zurück zur Auswahl" }).click();
  await memberButton(page, to).click();
  await expect(page.getByTestId("theke-open")).toHaveText("4,00 €");
});
