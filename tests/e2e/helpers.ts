import { expect, type Page } from "@playwright/test";
import { ADMIN } from "./fixtures";

/** Verwaltung mit der PIN entsperren und zur gewünschten Seite gehen. */
export async function openVerwaltung(page: Page, path = "/verwaltung") {
  await page.goto(path);
  if (page.url().includes("/verwaltung/entsperren")) {
    await page.getByLabel("PIN").fill(ADMIN.pin);
    await page.getByRole("button", { name: "Entsperren" }).click();
    await expect(page).not.toHaveURL(/entsperren/);
  }
}

/** Bildschirmfoto zur Sichtkontrolle unter test-results/shots/<name>-<gerät>.png */
export async function shot(page: Page, name: string, project: string) {
  await page.screenshot({ path: `test-results/shots/${name}-${project}.png`, fullPage: true });
}

/** Neues Mitglied in der Verwaltung anlegen; liefert ID und persönlichen Link. */
export async function createMemberWithLink(page: Page, name: string): Promise<{ id: string; url: string }> {
  await openVerwaltung(page, "/verwaltung/mitglieder");
  await page.getByRole("button", { name: "Neues Mitglied" }).click();
  await page.getByRole("dialog").getByLabel("Name").fill(name);
  await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const id = page.url().split("/").at(-1)!;
  const url = await page.getByTestId("member-url").innerText();
  return { id, url: new URL(url).pathname };
}

/** Wie die Theke: Vorgänge an /api/sync schicken (mit der Anmeldung der Seite). */
export async function sendOps(page: Page, ops: unknown[]) {
  const origin = new URL(page.url()).origin;
  const res = await page.request.post("/api/sync", {
    data: { deviceId: "e2e", ops },
    headers: { origin },
  });
  expect(res.ok()).toBe(true);
  const { results } = (await res.json()) as { results: { status: string }[] };
  expect(results.map((r) => r.status)).toEqual(ops.map(() => "ok"));
}

/** Artikel-ID aus dem Stand der Theke. */
export async function articleId(page: Page, name: string): Promise<{ id: string; priceCents: number }> {
  const res = await page.request.get("/api/theke/stand");
  const stand = (await res.json()) as { articles: { id: string; name: string; priceCents: number }[] };
  const a = stand.articles.find((x) => x.name === name);
  if (!a) throw new Error(`Artikel ${name} fehlt`);
  return a;
}

/** Wie das Tablet: Bestellungen holen bzw. Küche/Bestellung ändern (mit der Anmeldung der Seite). */
export async function thekeOrders(page: Page, body?: unknown) {
  const origin = new URL(page.url()).origin;
  const res = body
    ? await page.request.post("/api/theke/bestellungen", { data: body, headers: { origin } })
    : await page.request.get("/api/theke/bestellungen");
  expect(res.ok()).toBe(true);
  return (await res.json()) as {
    kitchenOpen: boolean;
    orders: { id: string; memberId: string; status: string; note: string | null; lines: { articleId: string; articleName: string; quantity: number; unitPriceCents: number }[] }[];
  };
}

/** Einstellungen öffnen und warten, bis die KI-Karte bedienbar ist (Seite im Browser gestartet). */
export async function openAiSettings(page: Page) {
  await openVerwaltung(page, "/verwaltung/einstellungen");
  await expect(page.locator("#ai-key")).toBeEnabled();
  const card = page.getByTestId("ai-schluessel");
  // innerText trennt die nebeneinander stehenden Teile mit Zeilenumbruch → beliebiger Abstand
  return { card, hasKey: async () => /API-Schlüssel hinterlegt:\s*sk-ant-/.test(await card.innerText()) };
}

/**
 * Echter Fehler in der Browser-Konsole? Safari meldet ein abgebrochenes Vorladen von Links
 * (Next.js „_rsc“-Anfrage, wenn man die Seite vorher verlässt) als „… due to access control checks.“ –
 * das ist harmlos und wird nicht gezählt.
 */
export function isRealConsoleError(text: string): boolean {
  return !/_rsc=\S*\s+due to access control checks/.test(text);
}

