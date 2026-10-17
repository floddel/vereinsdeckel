import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { article, file, member, memberToken, purchase, settings } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { exportBackup, importBackup, isFreshInstallation, parseBackup } from "./backup";
import { createPurchase } from "./purchases";
import { getStockOverview } from "./stock";
import { applyOps } from "./theke/apply-ops";
import { getThekeSnapshot } from "./theke/snapshot";

const at = "2026-10-15T19:00:00.000Z";

/** Eine „gebrauchte“ Installation: Einstellungen, Logo, Artikel (auch Ausschank), Mitglied mit Link, Einkauf, Buchungen. */
async function usedInstallation(): Promise<{ db: Db; klaus: string; pils: string; korn: string }> {
  const db = await createTestDb();
  const [logo] = await db.insert(file).values({ mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) }).returning();
  const [{ id: klaus }] = await db.insert(member).values({ name: "Klaus Müller" }).returning();
  await db.insert(memberToken).values({ memberId: klaus, token: "geheimer-link-von-klaus-1234567890123456" });
  const [{ id: pils }, { id: korn }] = await db
    .insert(article)
    .values([
      { name: "Pils", categoryId: "getraenke", priceCents: 200, description: "frisch gezapft" },
      { name: "Korn 2 cl", categoryId: "getraenke", icon: "shot", priceCents: 100, servingMl: 20, bottleMl: 700 },
    ])
    .returning();
  await createPurchase(
    db,
    {
      purchasedOn: "2026-10-01",
      source: "opening",
      note: null,
      lines: [
        { articleId: pils, description: "Pils", quantity: 24, totalCents: 1200 },
        { articleId: korn, description: "Korn", quantity: 2, bottleMl: 700, totalCents: 1400 },
      ],
    },
    null,
  );
  await db.update(settings).set({ clubName: "TSV Musterstadt", logoFileId: logo.id, paypalName: "TSVMusterstadt", tipArticleId: korn, tipText: "Muss weg!" });
  await applyOps(
    db,
    [
      {
        type: "sale",
        id: randomUUID(),
        memberId: klaus,
        createdAt: at,
        lines: [
          { id: randomUUID(), articleId: pils, articleName: "Pils", quantity: 4, unitPriceCents: 200, isGuest: false },
          { id: randomUUID(), articleId: korn, articleName: "Korn 2 cl", quantity: 5, unitPriceCents: 100, isGuest: false },
        ],
      },
      { type: "payment", id: randomUUID(), memberId: klaus, createdAt: at, methodId: "cash", amountCents: 500, tipCents: 0, cashGivenCents: null, saleId: null },
    ],
    { deviceId: "t", cutoffHour: 6, now: new Date(at) },
  );
  return { db, klaus, pils, korn };
}

/** Wie beim Herunterladen und Hochladen: einmal durch JSON. */
const roundTrip = async (db: Db) => parseBackup(JSON.stringify(await exportBackup(db)));

// Mehrere Datenbanken je Test – unter Last im vollen Testlauf braucht das etwas länger.
describe("Sichern & Umziehen", { timeout: 30_000 }, () => {
  it("Stammdaten + aktueller Bestand: Artikel, Mitglied mit Link, Einstellungen, Bestand mit Wert – keine Buchungen", async () => {
    const { db: from, klaus, pils, korn } = await usedInstallation();
    const backup = await roundTrip(from);
    if (typeof backup === "string") throw new Error(backup);
    const to = await createTestDb();
    const result = await importBackup(to, backup, "stammdaten", "2026-10-20");
    expect(result).toEqual({ ok: true, articles: 2, members: 1, bookings: 0, stockLines: 2 });

    const [s] = await to.select().from(settings);
    expect(s).toMatchObject({ clubName: "TSV Musterstadt", paypalName: "TSVMusterstadt", tipArticleId: korn, tipText: "Muss weg!" });
    expect((await to.select().from(file))[0].id).toBe(s.logoFileId);
    expect((await to.select().from(memberToken)).map((t) => t.token)).toEqual(["geheimer-link-von-klaus-1234567890123456"]);
    expect((await to.select().from(article).where(eq(article.id, pils)))[0].description).toBe("frisch gezapft");

    // Bestand und Warenwert wie beim Sichern, aber kein offener Betrag (keine Buchungen)
    const stock = async (db: Db) => (await getStockOverview(db)).rows.map((r) => [r.name, r.stock, r.valueCents]).sort();
    expect(await stock(to)).toEqual(await stock(from));
    expect((await stock(to)).find((r) => r[0] === "Korn 2 cl")?.[1]).toBe(1400 - 5 * 20);
    expect((await getThekeSnapshot(to, new Date(at))).members.find((m) => m.id === klaus)?.openCents).toBe(0);
    expect((await to.select().from(purchase)).map((p) => [p.source, p.purchasedOn])).toEqual([["opening", "2026-10-20"]]);
  });

  it("Alles: auch Buchungen und Zahlungen – der offene Betrag stimmt", async () => {
    const { db: from, klaus } = await usedInstallation();
    const backup = await roundTrip(from);
    if (typeof backup === "string") throw new Error(backup);
    const to = await createTestDb();
    expect(await importBackup(to, backup, "alles", "2026-10-20")).toMatchObject({ ok: true, bookings: 2 });
    const open = async (db: Db) => (await getThekeSnapshot(db, new Date(at))).members.find((m) => m.id === klaus)?.openCents;
    expect(await open(to)).toBe(await open(from));
    expect(await open(to)).toBe(800 + 500 - 500);
    expect((await getStockOverview(to)).valueCents).toBe((await getStockOverview(from)).valueCents);
  });

  it("nur in eine frische Installation; fremde oder neuere Dateien werden abgelehnt", async () => {
    const { db } = await usedInstallation();
    const backup = await roundTrip(db);
    if (typeof backup === "string") throw new Error(backup);
    expect(await isFreshInstallation(db)).toBe(false);
    expect(await importBackup(db, backup, "stammdaten", "2026-10-20")).toMatchObject({ ok: false, error: expect.stringContaining("frische Installation") });

    // Sicherungen im älteren Format gelten weiter
    expect(typeof parseBackup(JSON.stringify({ ...backup, format: "vereinsheim-sicherung" }))).toBe("object");
    expect(parseBackup("kein json")).toMatch(/kein gültiges JSON/);
    expect(parseBackup(JSON.stringify({ format: "etwas anderes" }))).toMatch(/keine Sicherung dieser App/);
    expect(parseBackup(JSON.stringify({ ...backup, schema: backup.schema + 1 }))).toMatch(/neueren Version/);
  });

  it("enthält keine Zugangsdaten (PIN, KI-Schlüssel, Login)", async () => {
    const { db } = await usedInstallation();
    await db.update(settings).set({ pinHash: "scrypt$geheim$hash", anthropicKeyEnc: "v1.geheim" });
    const text = JSON.stringify(await exportBackup(db));
    expect(text).not.toContain("scrypt$geheim");
    expect(text).not.toContain("v1.geheim");
    expect(text).not.toMatch(/auth_|password|session/i);
  });
});
