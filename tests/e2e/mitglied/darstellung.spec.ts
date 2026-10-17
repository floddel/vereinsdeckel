import { expect, test } from "@playwright/test";
import { createMemberWithLink } from "../helpers";

test("Mitgliederseite ist hell, auch wenn das Handy dunkel eingestellt ist – Dunkel lässt sich wählen", async ({ page, browser }, testInfo) => {
  const { url } = await createMemberWithLink(page, `Darstellung ${testInfo.project.name}`);
  const handy = await browser.newContext({ ...testInfo.project.use, colorScheme: "dark" });
  const p = await handy.newPage();
  await p.goto(url);
  const html = p.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  const schalter = p.getByRole("radiogroup", { name: "Darstellung" });
  await expect(schalter.getByRole("radio", { name: "Hell" })).toHaveAttribute("aria-checked", "true");
  await schalter.getByRole("radio", { name: "Dunkel" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");

  // Die Wahl bleibt auf diesem Handy, auch auf den Unterseiten
  await p.getByRole("link", { name: "Meine Kassenzettel" }).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await p.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await handy.close();
});
