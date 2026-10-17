import { expect, test } from "@playwright/test";
import { ADMIN, NO_AUTH } from "../fixtures";
import { openVerwaltung, shot } from "../helpers";
import { totp } from "../totp";

// Kleines gültiges PNG (8×8 Pixel, blau)
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAEklEQVR4nGOQi1rwHx9mGBkKAJ7khcHrmFcQAAAAAElFTkSuQmCC",
  "base64",
);

test("Einstellungen speichern, PayPal-Name prüfen, Logo hochladen", async ({ page }, testInfo) => {
  await openVerwaltung(page, "/verwaltung/einstellungen");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();

  await page.getByLabel("Vereinsname").fill("Angelverein Petri Heil");
  await page.getByLabel("PayPal.me-Name").fill("Petri Heil!");
  await page.getByRole("button", { name: "Einstellungen speichern" }).click();
  await expect(page.getByText("Nur Buchstaben und Ziffern")).toBeVisible();

  // Eingefügter Link wird auf den Namen gekürzt
  await page.getByLabel("PayPal.me-Name").fill("https://paypal.me/PetriHeil");
  await expect(page.getByText("https://paypal.me/PetriHeil/14.50EUR")).toBeVisible();
  await page.getByLabel("Warnung ab offenem Betrag (€)").fill("25");
  await page.getByRole("button", { name: "Einstellungen speichern" }).click();
  await expect(page.getByText("Einstellungen gespeichert")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("PayPal.me-Name")).toHaveValue("PetriHeil");
  await expect(page.getByLabel("Vereinsname")).toHaveValue("Angelverein Petri Heil");
  await expect(page.getByLabel("Warnung ab offenem Betrag (€)")).toHaveValue("25,00");

  // Logo hochladen (Auswahl ist erst aktiv, wenn die Seite fertig geladen ist)
  await expect(page.getByLabel("Logo-Datei")).toBeEnabled();
  await page.getByLabel("Logo-Datei").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Logo gespeichert")).toBeVisible();
  const logo = page.getByRole("img", { name: "Vereinslogo" });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await shot(page, "einstellungen", testInfo.project.name);
});

test("PIN ändern (und zurück)", async ({ page }) => {
  await openVerwaltung(page, "/verwaltung/einstellungen");
  const change = async (from: string, to: string) => {
    await page.getByLabel("Aktuelle PIN").fill(from);
    await page.getByLabel("Neue PIN", { exact: true }).fill(to);
    await page.getByLabel("Neue PIN wiederholen").fill(to);
    await page.getByRole("button", { name: "PIN ändern" }).click();
  };
  await change("9999", "2468");
  await expect(page.getByText(/PIN falsch/)).toBeVisible();
  await change(ADMIN.pin, "2468");
  await expect(page.getByText("PIN geändert")).toBeVisible();
  await change("2468", ADMIN.pin);
  await expect(page.getByText("PIN geändert").last()).toBeVisible();
});

test("Angemeldete Geräte: ein anderes Gerät abmelden", async ({ page, browser }, testInfo) => {
  // Zweites Gerät meldet sich an
  const other = await browser.newContext({ storageState: NO_AUTH });
  const tablet = await other.newPage();
  await tablet.goto("/login");
  await tablet.getByLabel("E-Mail").fill(ADMIN.email);
  await tablet.getByLabel("Passwort").fill(ADMIN.password);
  await tablet.getByRole("button", { name: "Anmelden" }).click();
  await expect(tablet).toHaveURL(/\/theke/);

  await openVerwaltung(page, "/verwaltung/einstellungen");
  const card = page.getByTestId("geraete");
  await expect(card.getByTestId("geraet").filter({ hasText: "dieses Gerät" })).toHaveCount(1);
  await expect(card.getByTestId("geraet").filter({ hasNotText: "dieses Gerät" }).first()).toBeVisible();
  await shot(page, "geraete", testInfo.project.name);
  await card.getByRole("button", { name: "Alle anderen Geräte abmelden" }).click();
  await expect(page.getByText(/Gerät(e)? abgemeldet/)).toBeVisible();
  await expect(card.getByTestId("geraet")).toHaveCount(1);
  await expect(card.getByRole("button", { name: "Alle anderen Geräte abmelden" })).toBeDisabled();

  // Das andere Gerät ist abgemeldet, dieses nicht
  await tablet.goto("/theke");
  await expect(tablet).toHaveURL(/\/login/);
  await other.close();
  await page.goto("/verwaltung/einstellungen");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
});

test("Passwort ändern (und wieder zurück)", async ({ page }) => {
  await openVerwaltung(page, "/verwaltung/einstellungen");
  const change = async (current: string, next: string) => {
    await page.getByLabel("Aktuelles Passwort").fill(current);
    await page.getByLabel("Neues Passwort", { exact: true }).fill(next);
    await page.getByLabel("Neues Passwort wiederholen").fill(next);
    await page.getByRole("button", { name: "Passwort ändern" }).click();
  };
  await change("falsch-falsch-falsch", "ganz-neues-passwort-1");
  await expect(page.getByText("Aktuelles Passwort stimmt nicht")).toBeVisible();
  await change(ADMIN.password, "ganz-neues-passwort-1");
  await expect(page.getByText(/^Passwort geändert/)).toBeVisible();
  await change("ganz-neues-passwort-1", ADMIN.password);
  await expect(page.getByText(/^Passwort geändert/).last()).toBeVisible();
  // Dieses Gerät bleibt angemeldet und entsperrt
  await page.goto("/verwaltung/einstellungen");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
});

test("Zweiter Faktor: einschalten, mit Code und Notfall-Code anmelden, ausschalten", async ({ browser, playwright, baseURL }, testInfo) => {
  // Eigene Anmeldung: Ein- und Ausschalten erneuert die Anmeldung – die gemeinsame der anderen Tests
  // wäre danach ungültig.
  const own = await browser.newContext({ storageState: NO_AUTH });
  const page = await own.newPage();
  await page.goto("/login");
  await page.getByLabel("E-Mail").fill(ADMIN.email);
  await page.getByLabel("Passwort").fill(ADMIN.password);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await expect(page).toHaveURL(/\/theke/);
  await openVerwaltung(page, "/verwaltung/einstellungen");
  const card = page.getByTestId("zweiter-faktor");
  await expect(card).toContainText("aus – bitte einschalten");

  // Einschalten: Passwort, QR-Code, Notfall-Codes, erster Code aus der App
  await card.getByRole("button", { name: "Einschalten" }).click();
  await card.getByLabel("Passwort zur Bestätigung").fill("falsch-falsch-falsch");
  await card.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByText("Passwort stimmt nicht")).toBeVisible();
  await card.getByLabel("Passwort zur Bestätigung").fill(ADMIN.password);
  await card.getByRole("button", { name: "Weiter" }).click();
  await expect(card.getByRole("img", { name: "QR-Code für die Authenticator-App" })).toBeVisible();
  const secret = (await card.getByTestId("totp-secret").innerText()).trim();
  const backup = (await card.getByTestId("notfall-codes").getByRole("listitem").allInnerTexts()).map((c) => c.trim());
  expect(backup).toHaveLength(10);
  // gut abzutippen: nur Kleinbuchstaben und Ziffern ohne 0/o, 1/l/i
  for (const c of backup) expect(c).toMatch(/^[a-hj-km-np-z2-9]{5}-[a-hj-km-np-z2-9]{5}$/);
  await shot(page, "zweiter-faktor", testInfo.project.name);
  await card.getByLabel("Code aus der App").fill("000000");
  await card.getByRole("button", { name: "Bestätigen und einschalten" }).click();
  await expect(page.getByText(/^Code stimmt nicht/)).toBeVisible();
  await card.getByLabel("Code aus der App").fill(totp(secret));
  await card.getByRole("button", { name: "Bestätigen und einschalten" }).click();
  await expect(page.getByText("Zweiter Faktor eingeschaltet")).toBeVisible();
  await expect(card).toContainText("eingeschaltet");
  // Die Verwaltung bleibt dabei entsperrt
  await page.goto("/verwaltung/einstellungen");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();

  const login = async () => {
    const ctx = await browser.newContext({ storageState: NO_AUTH });
    const p = await ctx.newPage();
    await p.goto("/login?next=%2Fverwaltung");
    await p.getByLabel("E-Mail").fill(ADMIN.email);
    await p.getByLabel("Passwort").fill(ADMIN.password);
    await p.getByRole("button", { name: "Anmelden" }).click();
    await expect(p).toHaveURL(/\/login\/code/);
    return { ctx, p };
  };

  try {
    // Passwort allein reicht nicht: ohne Code keine Theke
    const a = await login();
    await a.p.goto("/theke");
    await expect(a.p).toHaveURL(/\/login\?/);
    await a.ctx.close();

    // Falscher Code, dann richtiger → angemeldet (und weiter zum Ziel)
    const b = await login();
    await b.p.getByLabel("Code").fill("000000");
    await b.p.getByRole("button", { name: "Bestätigen" }).click();
    await expect(b.p.getByText("Code stimmt nicht")).toBeVisible();
    await b.p.getByLabel("Code").fill(totp(secret));
    await b.p.getByRole("button", { name: "Bestätigen" }).click();
    await expect(b.p.getByRole("button", { name: "Entsperren" })).toBeVisible(); // angemeldet, jetzt fehlt nur die PIN
    await b.ctx.close();

    // Notfall-Code: einmal gültig (Großschreibung vom Abtippen egal)
    const c = await login();
    await c.p.getByLabel("Code").fill(backup[0].toUpperCase());
    await c.p.getByRole("button", { name: "Bestätigen" }).click();
    await expect(c.p.getByRole("button", { name: "Entsperren" })).toBeVisible();
    await c.ctx.close();
    const d = await login();
    await d.p.getByLabel("Code").fill(backup[0]);
    await d.p.getByRole("button", { name: "Bestätigen" }).click();
    await expect(d.p.getByText("Code stimmt nicht")).toBeVisible();
    await d.ctx.close();
  } finally {
    // Ausschalten (sonst bräuchten alle anderen Tests einen Code)
    await page.goto("/verwaltung/einstellungen");
    const before = await own.storageState();
    await card.getByRole("button", { name: "Ausschalten" }).click();
    await card.getByLabel("Passwort zur Bestätigung").fill(ADMIN.password);
    await card.getByRole("button", { name: "Ausschalten" }).click();
    await expect(page.getByText("Zweiter Faktor ausgeschaltet")).toBeVisible();
    // Dabei erneuert Better Auth die Anmeldung. Eine Anfrage, die noch mit der alten losgeschickt
    // wurde (z. B. eine vorgeladene Seite) und deren Antwort erst jetzt ankommt, darf die übertragene
    // PIN-Freigabe nicht überschreiben.
    await page.waitForLoadState();
    const old = await playwright.request.newContext({ baseURL, storageState: before });
    const lateResponse = await old.get("/verwaltung/kasse", { maxRedirects: 0 });
    const lateCookies = lateResponse.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith("vd_pin"));
    expect(lateCookies.length).toBeGreaterThan(0);
    await own.addCookies(
      lateCookies.map((h) => {
        const [name, value] = h.value.split(";")[0].split("=");
        return { name, value, url: baseURL, httpOnly: true, sameSite: "Strict" as const };
      }),
    );
    await old.dispose();
  }
  // Die Verwaltung bleibt entsperrt
  await page.goto("/verwaltung/einstellungen");
  await expect(card).toContainText("aus – bitte einschalten");
  // Anmelden geht wieder nur mit Passwort
  const ctx = await browser.newContext({ storageState: NO_AUTH });
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.getByLabel("E-Mail").fill(ADMIN.email);
  await p.getByLabel("Passwort").fill(ADMIN.password);
  await p.getByRole("button", { name: "Anmelden" }).click();
  await expect(p).toHaveURL(/\/theke/);
  await ctx.close();
  await own.close();
});
