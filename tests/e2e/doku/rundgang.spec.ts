import { randomUUID } from "node:crypto";
import { devices, expect, test } from "@playwright/test";
import { NO_AUTH } from "../fixtures";
import { createMemberWithLink, openVerwaltung, sendOps } from "../helpers";

/**
 * Sichtkontrolle: alle Seiten hell und dunkel als Bild – nur auf Abruf:
 * RUNDGANG=vorher npx playwright test --project=setup --project=doku rundgang
 * Bilder unter test-results/rundgang/<RUNDGANG>/.
 */
test.skip(!process.env.RUNDGANG, "nur mit RUNDGANG=<ordner>");
test.setTimeout(600_000);

const dir = `test-results/rundgang/${process.env.RUNDGANG}`;

const verwaltung = [
  "/verwaltung",
  "/verwaltung/heute",
  "/verwaltung/heute/aufsteller",
  "/verwaltung/artikel",
  "/verwaltung/mitglieder",
  "/verwaltung/mitglieder/import",
  "/verwaltung/mitglieder/qr",
  "/verwaltung/abende",
  "/verwaltung/statistik",
  "/verwaltung/einkaeufe",
  "/verwaltung/einkaeufe/neu",
  "/verwaltung/kasse",
  "/verwaltung/kasse/kassenbuch",
  "/verwaltung/bestand",
  "/verwaltung/bestand/inventur",
  "/verwaltung/datenschutz",
  "/verwaltung/einstellungen",
  "/verwaltung/sicherung",
  "/verwaltung/einrichtung",
  "/verwaltung/ueber",
];

const name = (path: string) => path.replace(/^\//, "").replaceAll("/", "_") || "start";

test("Rundgang", async ({ page, browser }) => {
  await openVerwaltung(page);
  const now = new Date().toISOString();
  const stand = (await (await page.request.get("/api/theke/stand")).json()) as {
    articles: { id: string; name: string; priceCents: number }[];
    members: { id: string; name: string }[];
  };
  const art = (n: string) => stand.articles.find((a) => a.name === n)!;
  const line = (n: string, quantity: number) => ({
    id: randomUUID(), articleId: art(n).id, articleName: n, quantity, unitPriceCents: art(n).priceCents, isGuest: false,
  });
  await sendOps(page, [0, 3, 7].map((i) => ({ type: "sale", id: randomUUID(), memberId: stand.members[i].id, createdAt: now, lines: [line("Pils 0,33", 3)] })));
  const { id: memberId, url } = await createMemberWithLink(page, "Anna Beispiel");
  await sendOps(page, [{ type: "sale", id: randomUUID(), memberId, createdAt: now, lines: [line("Pils 0,33", 4), line("Bratwurst", 1)] }]);

  const extra = [`/verwaltung/mitglieder/${memberId}`];
  await openVerwaltung(page, "/verwaltung/abende");
  const abend = page.getByTestId("abende").getByRole("row").nth(1).getByRole("link");
  if (await abend.count()) extra.push(new URL(await abend.first().getAttribute("href").then((h) => h!), page.url()).pathname);
  await openVerwaltung(page, "/verwaltung/einkaeufe");
  const einkauf = page.locator('a[href^="/verwaltung/einkaeufe/"]:not([href$="/neu"])').first();
  if (await einkauf.count()) extra.push((await einkauf.getAttribute("href"))!);

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const [w, h, tag] of [[1280, 860, "desktop"], [820, 1180, "tablet"]] as const) {
      await page.setViewportSize({ width: w, height: h });
      for (const path of [...verwaltung, ...extra]) {
        await openVerwaltung(page, path);
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `${dir}/${scheme}/${tag}/${name(path)}.png`, fullPage: true });
      }
    }
    // Ein Dialog als Beispiel
    await page.setViewportSize({ width: 1280, height: 860 });
    await openVerwaltung(page, "/verwaltung/artikel");
    await page.getByRole("button", { name: /Neuer Artikel/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(500); // Einblenden abwarten
    await page.screenshot({ path: `${dir}/${scheme}/desktop/dialog-artikel.png` });

    // Mitglied (Handy) und öffentliche Seiten
    const phone = await browser.newContext({ ...devices["iPhone 15"], colorScheme: scheme, storageState: NO_AUTH });
    const p = await phone.newPage();
    for (const path of [url, `${url}/zettel`, `${url}/uebersicht`, `${url}/bestellen`, "/m/ungueltig", "/so-gehts", "/datenschutz", "/karte", "/login"]) {
      await p.goto(path);
      await p.waitForLoadState("networkidle");
      await p.screenshot({ path: `${dir}/${scheme}/handy/${name(path.replace(url, "/m/anna"))}.png`, fullPage: true });
    }
    await phone.close();
  }
});
