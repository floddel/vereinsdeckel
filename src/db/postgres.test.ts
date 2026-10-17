import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getMenu } from "@/server/menu";
import { anonymizeMember } from "@/server/privacy";
import { applyOps } from "@/server/theke/apply-ops";
import { getThekeSnapshot } from "@/server/theke/snapshot";
import { createPostgresDb, type Db } from "./client";
import { article, member, sale } from "./schema";
import { migrateDb, seedBaseData } from "./setup";

/**
 * Der PostgreSQL-Weg (DATABASE_URL, z. B. Neon): echter Treiber „pg“ über das PostgreSQL-Protokoll.
 * Als Server dient PGlite hinter pglite-socket – so braucht der Test kein installiertes PostgreSQL.
 */
const PORT = 55_432;
let pglite: PGlite;
let server: PGLiteSocketServer;
let db: Db;
let lastSaleId: string;

beforeAll(async () => {
  pglite = await PGlite.create();
  server = new PGLiteSocketServer({ db: pglite, port: PORT, host: "127.0.0.1" });
  await server.start();
  process.env.DATABASE_POOL_MAX = "1";
  db = createPostgresDb(`postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres?sslmode=disable`);
});

afterAll(async () => {
  await (db as unknown as { $client: { end(): Promise<void> } }).$client.end();
  await server.stop();
  await pglite.close();
});

describe("PostgreSQL über DATABASE_URL", () => {
  it("Migrationen (zweimal hintereinander) und Grunddaten", async () => {
    await migrateDb(db);
    await migrateDb(db); // nichts mehr zu tun
    await seedBaseData(db);
    const result = (await db.execute(sql`select count(*)::int as n from category`)) as unknown as { rows: { n: number }[] };
    expect(result.rows[0].n).toBe(3);
  });

  it("buchen, stornieren (mit Sperre), Stand und Karte", async () => {
    const [{ id: klaus }] = await db.insert(member).values({ name: "Klaus Müller" }).returning();
    const [{ id: pils }] = await db.insert(article).values({ name: "Pils", categoryId: "getraenke", priceCents: 200, trackStock: false }).returning();
    const at = "2026-10-16T19:00:00.000Z";
    const ctx = { deviceId: "pg", cutoffHour: 6, now: new Date(at) };
    const saleId = randomUUID();
    const lineId = randomUUID();
    const results = await applyOps(
      db,
      [
        { type: "sale", id: saleId, memberId: klaus, createdAt: at, lines: [{ id: lineId, articleId: pils, articleName: "Pils", quantity: 3, unitPriceCents: 200, isGuest: false }] },
        { type: "reversal", id: randomUUID(), saleId, createdAt: at, reason: "Test", lines: [{ lineId, quantity: 1 }] },
        { type: "payment", id: randomUUID(), memberId: klaus, createdAt: at, methodId: "cash", amountCents: 400, tipCents: 0, cashGivenCents: null, saleId: null },
      ],
      ctx,
    );
    expect(results.map((r) => r.status)).toEqual(["ok", "ok", "ok"]);
    const snap = await getThekeSnapshot(db, new Date(at));
    expect(snap.members.find((m) => m.id === klaus)?.openCents).toBe(0);
    expect((await getMenu(db, new Date(at))).sections.flatMap((s) => s.items.map((i) => i.name))).toContain("Pils");

    lastSaleId = saleId;
  });

  it("Anonymisieren (Transaktion mit Sperre und set_config)", async () => {
    const [{ id }] = await db.insert(member).values({ name: "Peter Weiß" }).returning();
    expect(await anonymizeMember(db, id)).toMatchObject({ ok: true });
  });

  // Zuletzt: pglite-socket (nur das Test-Werkzeug) bricht nach einem Fehler die Verbindung ab.
  it("Buchungen sind unveränderlich (Trigger aus den Migrationen)", async () => {
    await expect(db.update(sale).set({ reason: "geändert" }).where(eq(sale.id, lastSaleId))).rejects.toThrow();
  });
});
