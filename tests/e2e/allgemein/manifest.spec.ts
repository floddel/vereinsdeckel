import { expect, test } from "@playwright/test";
import { NO_AUTH } from "../fixtures";

test.use({ storageState: NO_AUTH });

test("App-Manifest: Theke als Vollbild-App, Symbole erreichbar", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ start_url: "/theke", display: "fullscreen", lang: "de" });
  for (const icon of manifest.icons as { src: string }[]) {
    const r = await request.get(icon.src);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()["content-type"]).toBe("image/png");
  }
  const sw = await request.get("/sw.js");
  expect(sw.ok()).toBe(true);
  expect(sw.headers()["cache-control"]).toContain("no-store");
  expect((await request.get("/apple-icon.png")).ok()).toBe(true);
});
