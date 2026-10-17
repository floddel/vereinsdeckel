import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { article, purchaseAlias, settings } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { sealApiKey } from "./anthropic";
import { learnAliases, recognizeReceipt } from "./receipt-recognition";

let db: Db;
let pils: string;
const image = { mimeType: "image/jpeg", base64: "AAAA" };

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "x".repeat(40));
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  db = await createTestDb();
  [{ id: pils }] = await db.insert(article).values({ name: "Pils 0,5", categoryId: "getraenke", priceCents: 200, packSize: 20 }).returning();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const enable = () => db.update(settings).set({ aiReceiptsEnabled: true, anthropicKeyEnc: sealApiKey("sk-ant-test-0123456789") }).where(eq(settings.id, 1));

function answer(input: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "tool_use", name: "einkauf_erfassen", input }] }), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("recognizeReceipt", () => {
  it("ausgeschaltet: keine Anfrage an Anthropic", async () => {
    const f = answer({});
    expect(await recognizeReceipt(db, image)).toMatchObject({ ok: false, error: expect.stringContaining("ausgeschaltet") });
    expect(f).not.toHaveBeenCalled();
  });

  it("schickt Foto, Artikelliste und Schlüssel – und übersetzt die Antwort", async () => {
    await enable();
    const f = answer({
      haendler: "Metro",
      datum: "2026-10-14",
      summe_cents: 3398,
      positionen: [{ bon_text: "PILS 20X0,5", menge: 2, gesamt_cents: 3398, artikel_id: pils, stueck_je_menge: 20, flasche_ml: null }],
    });
    const r = await recognizeReceipt(db, image);
    expect(r).toMatchObject({ ok: true, suggestion: { merchant: "Metro", lines: [{ articleId: pils, crates: 2, count: 0 }] } });

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant-test-0123456789");
    const body = JSON.parse(String(init.body));
    expect(body.tool_choice).toEqual({ type: "tool", name: "einkauf_erfassen" });
    expect(body.messages[0].content[0]).toMatchObject({ type: "image", source: { data: "AAAA" } });
    expect(body.messages[0].content[1].text).toContain(`id=${pils} · Pils 0,5`);
  });

  it("verständliche Fehler bei ungültigem Schlüssel und unlesbarer Antwort", async () => {
    await enable();
    answer({}, 401);
    expect(await recognizeReceipt(db, image)).toMatchObject({ ok: false, error: expect.stringContaining("nicht mehr akzeptiert") });
    answer({ positionen: "kaputt" });
    expect(await recognizeReceipt(db, image)).toMatchObject({ ok: false, error: expect.stringContaining("nicht gelesen") });
  });
});

describe("learnAliases", () => {
  it("merkt sich Zuordnungen, neue überschreiben alte", async () => {
    await learnAliases(db, [{ text: "PILS 20X0,5", articleId: pils, unitsPerItem: 20, bottleMl: null }]);
    await learnAliases(db, [{ text: "PILS 20X0,5", articleId: pils, unitsPerItem: 24, bottleMl: null }]);
    const rows = await db.select().from(purchaseAlias);
    expect(rows).toHaveLength(1);
    expect(rows[0].unitsPerItem).toBe(24);
  });
});
