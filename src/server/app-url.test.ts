import { describe, expect, it } from "vitest";
import { authOrigin, configuredOrigin, originSource, secureCookies } from "./app-url";

describe("Adresse der App", () => {
  it("APP_URL hat Vorrang (ohne / am Ende)", () => {
    const env = { APP_URL: "https://theke.example.org/", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" };
    expect(configuredOrigin(env)).toBe("https://theke.example.org");
    expect(originSource(env)).toBe("fixed");
  });

  it("bei Vercel ohne APP_URL: automatisch die Produktionsadresse (Ein-Klick-Installation)", () => {
    const env = { VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "theke.mein-verein.de" };
    expect(configuredOrigin(env)).toBe("https://theke.mein-verein.de");
    expect(authOrigin(env)).toBe("https://theke.mein-verein.de");
    expect(originSource(env)).toBe("vercel");
    // Vorschau-Versionen nicht
    expect(configuredOrigin({ ...env, VERCEL_ENV: "preview" })).toBeNull();
  });

  it("lokal: QR-Codes aus der Anfrage (Heimnetz), Login darf auf localhost stehen", () => {
    const env = { BETTER_AUTH_URL: "http://localhost:3000" };
    expect(configuredOrigin(env)).toBeNull();
    expect(originSource(env)).toBe("request");
    expect(authOrigin(env)).toBe("http://localhost:3000");
  });

  it("Secure-Cookies nur mit fester https-Adresse – im Heimnetz über http nicht (sonst kein Login)", () => {
    expect(secureCookies({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe(true);
    expect(secureCookies({ APP_URL: "https://theke.example.org" })).toBe(true);
    expect(secureCookies({})).toBe(false); // Docker im Heimnetz ohne APP_URL
    expect(secureCookies({ BETTER_AUTH_URL: "http://localhost:3000" })).toBe(false);
  });
});
