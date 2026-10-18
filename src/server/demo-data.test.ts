import { verifyPassword } from "better-auth/crypto";
import { count, desc, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { article, authAccount, authUser, member, memberToken, sale, settings } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { businessDate } from "@/domain/business-date";
import { DEMO_LOGIN } from "@/lib/demo";
import { verifyPin } from "@/lib/pin";
import { generateMemberToken } from "@/lib/token";
import { seedDemoData } from "./demo-data";
import { getThekeOrders } from "./food-orders";
import { getMemberStand } from "./member-view";
import { listEvenings } from "./reports";

let db: Db;
const now = new Date("2026-10-17T18:30:00Z"); // 20:30 Uhr in Berlin

beforeAll(async () => {
  db = await createTestDb();
  expect(await seedDemoData(db, generateMemberToken, now)).toBe(true);
});

describe("seedDemoData", () => {
  it("legt den Zugang der Demo an (Passwort und PIN wie auf der Anmeldeseite)", async () => {
    const [user] = await db.select().from(authUser);
    expect(user.email).toBe(DEMO_LOGIN.email);
    expect(user.twoFactorEnabled).toBe(false);
    const [account] = await db.select().from(authAccount).where(eq(authAccount.userId, user.id));
    expect(account.providerId).toBe("credential");
    expect(await verifyPassword({ hash: account.password!, password: DEMO_LOGIN.password })).toBe(true);
    const [s] = await db.select().from(settings);
    expect(verifyPin(DEMO_LOGIN.pin, s.pinHash)).toBe(true);
    expect(s.clubName).toBe("TSV Musterstadt");
    expect(s.setupDoneAt).not.toBeNull();
  });

  it("Mitglieder mit persönlichem Link", async () => {
    const members = await db.select().from(member);
    expect(members.length).toBeGreaterThanOrEqual(25);
    const [{ n }] = await db.select({ n: count() }).from(memberToken).where(isNull(memberToken.revokedAt));
    expect(n).toBe(members.length);
  });

  it("drei vergangene Abende und heute offene Deckel", async () => {
    const evenings = await listEvenings(db);
    const today = businessDate(now, 6);
    expect(evenings.map((e) => e.businessDate)).toContain(today);
    expect(evenings.filter((e) => e.businessDate < today)).toHaveLength(3);
    expect(evenings.some((e) => e.title === "Heimspiel gegen SV Nachbardorf")).toBe(true);
    for (const e of evenings) expect(e.revenueCents).toBeGreaterThan(0);

    const members = await db.select({ id: member.id, name: member.name }).from(member);
    const stands = await Promise.all(members.map((m) => getMemberStand(db, m, now)));
    const open = stands.filter((s) => s.openCents > 0);
    expect(open.length).toBeGreaterThanOrEqual(5);
    // Einer steht über der Warngrenze (30 €)
    expect(Math.max(...stands.map((s) => s.openCents))).toBeGreaterThan(3000);
    // Keine Buchung in der Zukunft
    const [{ latest }] = await db.select({ latest: sale.createdAt }).from(sale).orderBy(desc(sale.createdAt)).limit(1);
    expect(latest.getTime()).toBeLessThanOrEqual(now.getTime());
  });

  it("Tagesgericht, Tipp des Hauses und eine Handy-Bestellung", async () => {
    const [soup] = await db.select().from(article).where(eq(article.name, "Kartoffelsuppe"));
    expect(soup.offeredOn).toBe(businessDate(now, 6));
    const [s] = await db.select().from(settings);
    expect(s.tipArticleId).not.toBeNull();
    const orders = await getThekeOrders(db, now);
    expect(orders.kitchenOpen).toBe(true);
    expect(orders.orders).toHaveLength(1);
  });

  it("legt nichts doppelt an, wenn es schon ein Konto gibt", async () => {
    const [{ before }] = await db.select({ before: count() }).from(member);
    expect(await seedDemoData(db, generateMemberToken, now)).toBe(false);
    const [{ after }] = await db.select({ after: count() }).from(member);
    expect(after).toBe(before);
  });
});

describe("seedDemoData in einer eingerichteten Installation", () => {
  it("lässt sie unverändert", async () => {
    const own = await createTestDb();
    await own.insert(authUser).values({ id: "admin", name: "Hauswart", email: "hauswart@example.org" });
    expect(await seedDemoData(own, generateMemberToken, now)).toBe(false);
    const [{ n }] = await own.select({ n: count() }).from(member);
    expect(n).toBe(0);
    const [s] = await own.select().from(settings);
    expect(s.clubName).toBe("Mein Verein");
  });
});
