import { expect, test } from "@playwright/test";
import { createMemberWithLink, openVerwaltung } from "../helpers";

/** Auf dem Handy darf keine Seite breiter als der Bildschirm sein (sonst verkleinert das Handy alles). */
test("Karte, „So geht's“ und Bierdeckel passen auf den Handy-Bildschirm", async ({ page }, testInfo) => {
  const dish = `Breitensuppe ${testInfo.project.name}`;
  const { url } = await createMemberWithLink(page, `Breite ${testInfo.project.name}`);
  // Mit Tagesgericht ist die Sprungleiste der Karte am längsten
  await openVerwaltung(page, "/verwaltung/heute");
  const specials = page.getByTestId("selbst-gekocht");
  const neu = specials.getByRole("button", { name: "Neues Gericht" });
  await expect(neu.or(specials.getByLabel("Gericht"))).toBeVisible();
  if (await neu.isVisible()) await neu.click();
  await specials.getByLabel("Gericht").fill(dish);
  await specials.getByLabel("Preis (€)").fill("3,00");
  await specials.getByRole("button", { name: "Gericht anlegen" }).click();
  await expect(page.getByText(`${dish} angelegt`)).toBeVisible();

  const soll = page.viewportSize()!.width;
  for (const path of ["/karte", "/so-gehts", url]) {
    await page.goto(path);
    await expect(page.getByRole("heading").first()).toBeVisible();
    const { seite, fenster, inhalt } = await page.evaluate(() => ({
      seite: document.documentElement.scrollWidth,
      fenster: window.innerWidth,
      inhalt: Math.round(document.querySelector("main")?.getBoundingClientRect().width ?? 0),
    }));
    expect(fenster, `${path}: Ansicht nicht verkleinert`).toBe(soll);
    expect(seite, `${path}: nichts ragt über den Rand`).toBeLessThanOrEqual(soll);
    expect(inhalt, `${path}: Inhalt so breit wie der Bildschirm`).toBeLessThanOrEqual(soll);
  }

  await openVerwaltung(page, "/verwaltung/heute");
  await page.getByRole("switch", { name: `${dish} heute anbieten` }).click();
  await expect(page.getByText(`${dish} ist für heute raus`)).toBeVisible();
});
