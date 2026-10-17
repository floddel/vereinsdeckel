import { expect, test } from "@playwright/test";
import { openVerwaltung } from "../helpers";

test("Vereinsfarbe wählen: wirkt sofort, bleibt nach dem Neuladen und gilt auch für Mitglieder", async ({ page, browser }, testInfo) => {
  await openVerwaltung(page, "/verwaltung/einstellungen");
  const farben = page.getByRole("radiogroup", { name: "Vereinsfarbe" });
  await expect(farben.getByRole("radio", { name: "Blau" })).toHaveAttribute("aria-checked", "true");

  try {
    await farben.getByRole("radio", { name: "Petrol" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "petrol");
    await expect(page.getByText("Vereinsfarbe gespeichert")).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "petrol");
    await expect(farben.getByRole("radio", { name: "Petrol" })).toHaveAttribute("aria-checked", "true");

    // Neues Gerät ohne gemerkte Farbe (z. B. Handy eines Mitglieds): Farbe kommt vom Server
    const fremd = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
    const karte = await fremd.newPage();
    await karte.goto("/karte");
    await expect(karte.locator("html")).toHaveAttribute("data-accent", "petrol");
    await fremd.close();
  } finally {
    await openVerwaltung(page, "/verwaltung/einstellungen");
    await farben.getByRole("radio", { name: "Blau" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-accent");
  }
});

test("Eigene Vereinsfarbe mit Reglern: wirkt sofort, bleibt nach dem Neuladen", async ({ page }) => {
  await openVerwaltung(page, "/verwaltung/einstellungen");
  const farben = page.getByRole("radiogroup", { name: "Vereinsfarbe" });
  const tint = () => page.evaluate(() => document.documentElement.style.getPropertyValue("--tint-light"));

  try {
    await farben.getByRole("radio", { name: "Eigene" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "eigen");
    const vorher = await tint();
    expect(vorher).toMatch(/^#[0-9a-f]{6}$/);

    // Farbton per Tastatur verschieben (wie mit dem Finger, nur genauer)
    const farbton = page.getByRole("slider", { name: "Farbton" });
    await farbton.focus();
    for (let i = 0; i < 40; i++) await farbton.press("ArrowRight");
    await expect.poll(tint).not.toBe(vorher);
    const nachher = await tint();
    // Die Meldung „gespeichert“ steht schon vom Klick auf „Eigene“ da – also warten, bis die Regler fertig gespeichert sind
    await expect(page.getByTestId("eigene-farbe")).toHaveAttribute("aria-busy", "false");
    await expect(page.getByText("Vereinsfarbe gespeichert")).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-accent", "eigen");
    expect(await tint()).toBe(nachher);
    await expect(farben.getByRole("radio", { name: "Eigene" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("slider", { name: "Kräftigkeit" })).toBeVisible();
  } finally {
    await openVerwaltung(page, "/verwaltung/einstellungen");
    await farben.getByRole("radio", { name: "Blau" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-accent");
    expect(await tint()).toBe("");
  }
});
