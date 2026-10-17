import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { article, member, memberToken } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import type { ThekeOp } from "@/domain/theke";
import { generateMemberToken } from "@/lib/token";
import { findMemberByToken, getMemberReceipts, getMemberStand } from "./member-view";
import { applyOps } from "./theke/apply-ops";

let db: Db;
let klaus: { id: string; name: string };
let peter: { id: string; name: string };
let klausToken: string;
let pils: string;
let wurst: string;

beforeEach(async () => {
  db = await createTestDb();
  [klaus, peter] = await db.insert(member).values([{ name: "Klaus Müller" }, { name: "Peter Geheim" }]).returning({ id: member.id, name: member.name });
  klausToken = generateMemberToken();
  await db.insert(memberToken).values([
    { memberId: klaus.id, token: klausToken },
    { memberId: peter.id, token: generateMemberToken() },
  ]);
  [{ id: pils }, { id: wurst }] = await db
    .insert(article)
    .values([
      { name: "Pils 0,33", categoryId: "getraenke", icon: "beer", priceCents: 200, tallyGroup: "Bier" },
      { name: "Geheimwurst", categoryId: "essen", icon: "sausage", priceCents: 300 },
    ])
    .returning();
});

const sale = (memberId: string, articleId: string, name: string, qty: number, price: number, at: string): ThekeOp => ({
  type: "sale",
  id: randomUUID(),
  memberId,
  createdAt: at,
  lines: [{ id: randomUUID(), articleId, articleName: name, quantity: qty, unitPriceCents: price, isGuest: false }],
});
const ctx = (iso: string) => ({ deviceId: "test", cutoffHour: 6, now: new Date(iso) });

describe("findMemberByToken", () => {
  it("findet das Mitglied nur mit aktivem Link", async () => {
    expect(await findMemberByToken(db, klausToken)).toEqual(klaus);
    expect(await findMemberByToken(db, generateMemberToken())).toBeNull();
    expect(await findMemberByToken(db, "x' OR 1=1 --")).toBeNull();
    expect(await findMemberByToken(db, "")).toBeNull();
  });

  it("gesperrter Link oder anonymisiertes Mitglied → nichts", async () => {
    await db.update(memberToken).set({ revokedAt: new Date() }).where(eq(memberToken.memberId, klaus.id));
    expect(await findMemberByToken(db, klausToken)).toBeNull();

    const token = generateMemberToken();
    await db.insert(memberToken).values({ memberId: klaus.id, token });
    expect(await findMemberByToken(db, token)).toEqual(klaus);
    await db.update(member).set({ anonymizedAt: new Date() }).where(eq(member.id, klaus.id));
    expect(await findMemberByToken(db, token)).toBeNull();
  });
});

describe("getMemberStand", () => {
  it("enthält nur Daten dieses Mitglieds", async () => {
    const at = "2026-10-15T19:00:00.000Z";
    await applyOps(db, [sale(klaus.id, pils, "Pils 0,33", 3, 200, at), sale(peter.id, wurst, "Geheimwurst", 5, 300, at)], ctx(at));
    const stand = await getMemberStand(db, klaus);
    expect(stand).toMatchObject({ memberName: "Klaus Müller", openCents: 600, status: "open", strokes: 3 });
    expect(stand.coasters[0].map((g) => [g.label, g.count])).toEqual([["Bier", 3]]);
    const json = JSON.stringify(stand);
    expect(json).not.toContain("Peter");
    expect(json).not.toContain("Geheimwurst");
    expect(json).not.toContain(peter.id);
  });

  it("Version ändert sich bei neuen Strichen (für Live-Aktualisierung)", async () => {
    const before = await getMemberStand(db, klaus);
    expect(before.status).toBe("empty");
    const at = "2026-10-15T19:00:00.000Z";
    await applyOps(db, [sale(klaus.id, pils, "Pils 0,33", 1, 200, at)], ctx(at));
    const after = await getMemberStand(db, klaus);
    expect(after.version).not.toBe(before.version);
    expect(await getMemberStand(db, klaus)).toEqual(after);
  });
});

describe("getMemberReceipts", () => {
  it("ein Zettel je Abend, seitenweise, nur eigene Buchungen", async () => {
    for (const day of ["2026-10-01", "2026-10-08", "2026-10-15"]) {
      const at = `${day}T19:00:00.000Z`;
      await applyOps(db, [sale(klaus.id, pils, "Pils 0,33", 1, 200, at), sale(peter.id, wurst, "Geheimwurst", 1, 300, at)], ctx(at));
    }
    const page1 = await getMemberReceipts(db, klaus.id, { limit: 2 });
    expect(page1.receipts.map((r) => r.businessDate)).toEqual(["2026-10-15", "2026-10-08"]);
    expect(page1.receipts[0].openAfterCents).toBe(600);
    expect(page1.nextBefore).toBe("2026-10-08");
    const page2 = await getMemberReceipts(db, klaus.id, { limit: 2, before: page1.nextBefore! });
    expect(page2.receipts.map((r) => r.businessDate)).toEqual(["2026-10-01"]);
    expect(page2.nextBefore).toBeNull();
    expect(JSON.stringify([page1, page2])).not.toContain("Geheimwurst");
  });
});
