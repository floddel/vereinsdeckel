import { expect, test } from "@playwright/test";
import { NO_AUTH } from "../fixtures";
import { createMemberWithLink, openVerwaltung } from "../helpers";

test("Sicherheits-Header auf Seiten und Schnittstellen", async ({ request }) => {
  const page = await request.get("/login");
  const h = page.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["content-security-policy"]).not.toContain("unsafe-eval");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["strict-transport-security"]).toContain("max-age=");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");

  // Mitgliederlinks: nie als Referrer weitergeben
  const member = await request.get(`/m/${"A".repeat(43)}`);
  expect(member.headers()["referrer-policy"]).toBe("no-referrer");

  // Schnittstellen: Grund-Header ja, keine Seiten-CSP (PDFs, Bilder)
  const api = await request.get("/api/kassenbuch/pdf");
  expect(api.headers()["x-content-type-options"]).toBe("nosniff");
  expect(api.headers()["content-security-policy"]).toBeUndefined();
});

test("Theke, Verwaltung, Login und Mitgliederansicht laufen ohne CSP-Verstöße", async ({ page, browser }) => {
  const violations: string[] = [];
  const watch = async (p: typeof page) => {
    await p.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`));
    });
    p.on("console", (m) => m.type() === "error" && m.text().startsWith("CSP") && violations.push(`${p.url()}: ${m.text()}`));
  };
  await watch(page);
  await page.goto("/theke");
  await expect(page.getByRole("searchbox", { name: "Mitglied suchen" })).toBeVisible();
  for (const path of ["/verwaltung", "/verwaltung/statistik", "/verwaltung/einkaeufe/neu", "/verwaltung/mitglieder"]) {
    await openVerwaltung(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }

  const { url } = await createMemberWithLink(page, `CSP ${test.info().project.name}`);

  const anon = await browser.newContext({ storageState: NO_AUTH });
  const other = await anon.newPage();
  await watch(other);
  await other.goto("/login");
  await expect(other.getByRole("button", { name: "Anmelden" })).toBeVisible();
  // Öffentliche Karte und Erklärung
  await other.goto("/karte");
  await expect(other.getByRole("heading", { name: "Was gibt's heute?" })).toBeVisible();
  await other.goto("/so-gehts");
  await expect(other.getByRole("heading", { name: "Dein Bierdeckel aufs Handy" })).toBeVisible();
  // Mitgliederansicht: Bierdeckel und Kassenzettel
  await other.goto(url);
  await expect(other.getByRole("heading", { name: /^Hallo / })).toBeVisible();
  await other.goto(`${url}/zettel`);
  await expect(other.getByRole("heading", { level: 1 })).toBeVisible();
  await anon.close();
  expect(violations).toEqual([]);
});
