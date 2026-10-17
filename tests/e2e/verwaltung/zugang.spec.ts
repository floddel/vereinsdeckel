import { expect, test } from "@playwright/test";
import { ADMIN, NO_AUTH } from "../fixtures";
import { openVerwaltung } from "../helpers";

test.describe("ohne Anmeldung", () => {
  test.use({ storageState: NO_AUTH });

  test("Theke und Verwaltung führen zur Anmeldung", async ({ page }) => {
    await page.goto("/theke");
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/verwaltung/artikel");
    await expect(page).toHaveURL(/\/login\?next=%2Fverwaltung%2Fartikel/);
  });

  test("falsches Passwort wird abgewiesen, richtiges meldet an", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("E-Mail").fill(ADMIN.email);
    await page.getByLabel("Passwort").fill("falsch-falsch-falsch");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByText("E-Mail oder Passwort ist falsch")).toBeVisible();

    // Die E-Mail bleibt nach dem Fehler stehen.
    await expect(page.getByLabel("E-Mail")).toHaveValue(ADMIN.email);
    await page.getByLabel("Passwort").fill(ADMIN.password);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page).toHaveURL(/\/theke/);

    // Abmelden gibt es nur in der Verwaltung (hinter der PIN), nicht an der Theke.
    await openVerwaltung(page);
    const menu = page.getByRole("button", { name: "Menü öffnen" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("button", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/theke");
    await expect(page).toHaveURL(/\/login/);
  });

  test("Anmelden und Konto anlegen gehen nicht an der Sperre vorbei", async ({ request }) => {
    // Nur über das Formular (mit Sperre nach Fehlversuchen), nicht direkt bei Better Auth.
    const signIn = await request.post("/api/auth/sign-in/email", {
      data: { email: ADMIN.email, password: ADMIN.password },
    });
    expect(signIn.status()).toBe(404);
    const signUp = await request.post("/api/auth/sign-up/email", {
      data: { name: "Zweiter", email: "zweiter@example.org", password: "zweiter-zweiter" },
    });
    expect(signUp.status()).toBe(404);
    // Die ganze Schnittstelle von Better Auth ist nicht erreichbar (die App braucht sie nicht)
    for (const path of ["/api/auth/get-session", "/api/auth/ok", "/api/auth/update-user", "/api/auth/change-password"]) {
      expect((await request.post(path, { data: {} })).status(), path).toBe(404);
      expect((await request.get(path)).status(), path).toBe(404);
    }
  });

  test("ein zweites Admin-Konto ist nicht möglich", async ({ page }) => {
    await page.goto("/einrichten");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("angemeldet", () => {
  test("Weiterleitung nach dem Login bleibt auf der eigenen Seite", async ({ page, baseURL }) => {
    // %09 = Tab: Browser würden daraus "//evil.example" machen.
    await page.goto("/login?next=/%09/evil.example");
    await expect(page).toHaveURL(`${baseURL}/theke`);
    // Punkt-Abschnitt: "/.//evil.example" würde zu "//evil.example"
    await page.goto("/login?next=%2F.%2F%2Fevil.example");
    await expect(page).toHaveURL(`${baseURL}/theke`);
    await page.goto("/login?next=%2Fverwaltung%2Fartikel");
    await expect(page).toHaveURL(/\/verwaltung\/(artikel|entsperren)/);
  });

  test("Verwaltung verlangt die PIN", async ({ page }) => {
    await page.goto("/verwaltung");
    await expect(page).toHaveURL(/\/verwaltung\/entsperren/);

    await page.getByLabel("PIN").fill("0000");
    await page.getByRole("button", { name: "Entsperren" }).click();
    await expect(page.getByText(/PIN falsch \(noch \d Versuche\)/)).toBeVisible();

    await page.getByLabel("PIN").fill(ADMIN.pin);
    await page.getByRole("button", { name: "Entsperren" }).click();
    await expect(page).toHaveURL(/\/verwaltung$/);
    await expect(page.getByRole("heading", { name: "Übersicht" })).toBeVisible();
    await expect(page.getByText(/aktive Artikel/)).toBeVisible();
  });

  test("nach dem Sperren ist die PIN wieder nötig, die Theke bleibt offen", async ({ page }) => {
    await page.goto("/verwaltung/entsperren");
    await page.getByLabel("PIN").fill(ADMIN.pin);
    await page.getByRole("button", { name: "Entsperren" }).click();
    await expect(page).toHaveURL(/\/verwaltung$/);

    // Auf kleineren Bildschirmen steckt die Navigation im Menü.
    const menu = page.getByRole("button", { name: "Menü öffnen" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("button", { name: "Verwaltung sperren" }).click();

    await expect(page).toHaveURL(/\/theke/);
    await page.goto("/verwaltung");
    await expect(page).toHaveURL(/\/verwaltung\/entsperren/);
  });
});
