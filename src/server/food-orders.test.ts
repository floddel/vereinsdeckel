import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { article, foodOrder, foodOrderLine, member, sale, settings } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import type { SaleOp } from "@/domain/theke";
import {
  cancelFoodOrder,
  createFoodOrder,
  getMemberOrders,
  getThekeOrders,
  setKitchenOpen,
  updateFoodOrderStatus,
} from "./food-orders";
import { getMemberStand } from "./member-view";
import { getMenu } from "./menu";
import { createPurchase } from "./purchases";
import { getStockOverview } from "./stock";
import { applyOps } from "./theke/apply-ops";
import { getThekeSnapshot } from "./theke/snapshot";

let db: Db;
let klaus: string;
let peter: string;
let wurst: string;
let fisch: string;
let pils: string;
const now = new Date("2026-10-15T19:00:00Z"); // 21:00 Uhr in Berlin
const ctx = { deviceId: "tablet-test", cutoffHour: 6, now };

beforeEach(async () => {
  db = await createTestDb();
  [{ id: klaus }, { id: peter }] = await db
    .insert(member)
    .values([{ name: "Klaus Müller" }, { name: "Peter Weiß" }])
    .returning();
  [{ id: wurst }, { id: fisch }, { id: pils }] = await db
    .insert(article)
    .values([
      { name: "Bratwurst", categoryId: "essen", icon: "sausage", priceCents: 300, orderable: true },
      { name: "Fischbrötchen", categoryId: "essen", icon: "fish", priceCents: 350, orderable: true },
      // Getränke sind nie per Handy bestellbar – auch nicht mit Häkchen
      { name: "Pils", categoryId: "getraenke", icon: "beer", priceCents: 200, orderable: true },
    ])
    .returning();
  await createPurchase(
    db,
    {
      purchasedOn: "2026-10-01",
      source: "opening",
      note: null,
      lines: [
        { articleId: wurst, description: "", quantity: 50, totalCents: 5000 },
        { articleId: fisch, description: "", quantity: 50, totalCents: 5000 },
      ],
    },
    null,
  );
  await setKitchenOpen(db, true);
});

const order = (memberId: string, lines: [string, number][], note: string | null = null, at = now) =>
  createFoodOrder(db, memberId, { lines: lines.map(([articleId, quantity]) => ({ articleId, quantity })), note }, at);

async function orderId(memberId: string, lines: [string, number][], note: string | null = null) {
  const r = await order(memberId, lines, note);
  if (!r.ok) throw new Error(r.message);
  return r.id;
}

function pickupOp(memberId: string, foodOrderId: string, lines: [string, string, number, number][]): SaleOp {
  return {
    type: "sale",
    id: randomUUID(),
    memberId,
    createdAt: now.toISOString(),
    foodOrderId,
    lines: lines.map(([articleId, articleName, quantity, unitPriceCents]) => ({
      id: randomUUID(),
      articleId,
      articleName,
      quantity,
      unitPriceCents,
      isGuest: false,
    })),
  };
}

describe("Bestellen per Handy", () => {
  it("legt eine Bestellung an – noch keine Buchung", async () => {
    await orderId(klaus, [[wurst, 2], [fisch, 1]], "mit Senf");
    const mine = await getMemberOrders(db, klaus, now);
    expect(mine.kitchenOpen).toBe(true);
    expect(mine.menu.map((a) => a.name)).toEqual(["Bratwurst", "Fischbrötchen"]);
    expect(mine.orders).toHaveLength(1);
    expect(mine.orders[0]).toMatchObject({ status: "new", seen: false, note: "mit Senf", totalCents: 950 });
    expect(await db.select().from(sale)).toHaveLength(0);
  });

  it("nur bestellen, was da ist: offene Bestellungen sind reserviert", async () => {
    const [{ id: knacker }] = await db
      .insert(article)
      .values({ name: "Knacker", categoryId: "essen", icon: "sausage", priceCents: 200, orderable: true })
      .returning();
    await createPurchase(db, { purchasedOn: "2026-10-01", source: "opening", note: null, lines: [{ articleId: knacker, description: "", quantity: 3, totalCents: 225 }] }, null);
    await orderId(klaus, [[knacker, 2]]);
    expect((await getMemberOrders(db, peter, now)).menu.find((a) => a.id === knacker)?.left).toBe(1);
    expect(await order(peter, [[knacker, 2]])).toEqual({ ok: false, message: "Von Knacker sind nur noch 1 da." });
    await orderId(peter, [[knacker, 1]]);
    expect(await order(peter, [[knacker, 1]])).toEqual({ ok: false, message: "Knacker ist leider aus." });
    // ohne Bestandsführung: unbegrenzt
    await db.update(article).set({ trackStock: false }).where(eq(article.id, knacker));
    expect((await getMemberOrders(db, peter, now)).menu.find((a) => a.id === knacker)?.left).toBeNull();
  });

  it("geht nur bei offener Küche", async () => {
    await setKitchenOpen(db, false);
    expect(await order(klaus, [[wurst, 1]])).toEqual({ ok: false, message: "Die Küche ist gerade zu." });
    expect((await getMemberOrders(db, klaus, now)).kitchenOpen).toBe(false);
  });

  it("Küche gilt als zu, wenn kein Essen bestellbar ist", async () => {
    await db.update(article).set({ orderable: false });
    expect((await getMemberOrders(db, klaus, now)).kitchenOpen).toBe(false);
  });

  it("nur bestellbares Essen (keine Getränke, nichts Deaktiviertes)", async () => {
    expect(await order(klaus, [[pils, 1]])).toMatchObject({ ok: false });
    await db.update(article).set({ active: false }).where(eq(article.id, fisch));
    expect(await order(klaus, [[fisch, 1]])).toMatchObject({ ok: false });
  });

  it("selbst Gekochtes nur an dem Abend, für den es eingeschaltet ist (Handy und Theke)", async () => {
    const [{ id: eintopf }] = await db
      .insert(article)
      .values({ name: "Eintopf", categoryId: "essen", icon: "soup", priceCents: 450, orderable: true, trackStock: false, dailySpecial: true, offeredOn: "2026-10-08" })
      .returning();
    const shown = async () => (await getMemberOrders(db, klaus, now)).menu.map((a) => a.id);
    expect(await shown()).not.toContain(eintopf);
    expect(await order(klaus, [[eintopf, 1]])).toMatchObject({ ok: false });
    expect((await getThekeSnapshot(db, now)).articles.map((a) => a.id)).not.toContain(eintopf);

    await db.update(article).set({ offeredOn: "2026-10-15" }).where(eq(article.id, eintopf));
    expect(await shown()).toContain(eintopf);
    expect(await order(klaus, [[eintopf, 1]])).toMatchObject({ ok: true });
    expect((await getThekeSnapshot(db, now)).articles.map((a) => a.id)).toContain(eintopf);
  });

  it("nicht verfügbar: weg von Handy, Theke und Karte – der Bestand bleibt", async () => {
    await db.update(article).set({ available: false }).where(eq(article.id, wurst));
    expect((await getMemberOrders(db, klaus, now)).menu.map((a) => a.id)).not.toContain(wurst);
    expect(await order(klaus, [[wurst, 1]])).toMatchObject({ ok: false });
    expect((await getThekeSnapshot(db, now)).articles.map((a) => a.id)).not.toContain(wurst);
    expect((await getMenu(db, now)).sections.flatMap((s) => s.items.map((i) => i.id))).not.toContain(wurst);
    expect((await getStockOverview(db)).rows.find((r) => r.articleId === wurst)?.stock).toBe(50);

    await db.update(article).set({ available: true }).where(eq(article.id, wurst));
    expect(await order(klaus, [[wurst, 1]])).toMatchObject({ ok: true });
    expect((await getThekeSnapshot(db, now)).articles.map((a) => a.id)).toContain(wurst);
    expect((await getMenu(db, now)).sections.flatMap((s) => s.items.map((i) => i.id))).toContain(wurst);
  });

  it("höchstens 2 offene Bestellungen je Mitglied", async () => {
    await orderId(klaus, [[wurst, 1]]);
    await orderId(klaus, [[wurst, 1]]);
    expect(await order(klaus, [[wurst, 1]])).toMatchObject({ ok: false, message: expect.stringContaining("2 offene") });
    // andere Mitglieder sind davon nicht betroffen
    expect(await order(peter, [[wurst, 1]])).toMatchObject({ ok: true });
  });

  it("inaktive Mitglieder können nicht bestellen", async () => {
    await db.update(member).set({ active: false }).where(eq(member.id, klaus));
    expect(await order(klaus, [[wurst, 1]])).toMatchObject({ ok: false });
  });

  it("zurückziehen nur die eigene und nur, solange nicht angenommen", async () => {
    const a = await orderId(klaus, [[wurst, 1]]);
    expect(await cancelFoodOrder(db, peter, a)).toEqual({ ok: false, message: "Bestellung nicht gefunden." });
    expect(await cancelFoodOrder(db, klaus, a)).toEqual({ ok: true });

    const b = await orderId(klaus, [[wurst, 1]]);
    await updateFoodOrderStatus(db, b, "accept");
    expect(await cancelFoodOrder(db, klaus, b)).toMatchObject({ ok: false });
  });

  it("zeigt dem Mitglied nur die eigenen Bestellungen des Abends", async () => {
    await orderId(klaus, [[wurst, 1]]);
    await orderId(peter, [[fisch, 1]]);
    // gestern Abend
    await order(klaus, [[fisch, 1]], null, new Date("2026-10-14T19:00:00Z"));
    const mine = await getMemberOrders(db, klaus, now);
    expect(mine.orders.map((o) => o.lines[0].articleName)).toEqual(["Bratwurst"]);
  });

  it("Version ändert sich mit dem Status", async () => {
    const a = await orderId(klaus, [[wurst, 1]]);
    const before = (await getMemberOrders(db, klaus, now)).version;
    await updateFoodOrderStatus(db, a, "accept");
    expect((await getMemberOrders(db, klaus, now)).version).not.toBe(before);
  });

  it("löscht Bestellungen nach 30 Tagen, die Buchung bleibt", async () => {
    const old = await order(klaus, [[wurst, 1]], null, new Date("2026-09-01T19:00:00Z"));
    if (!old.ok) throw new Error(old.message);
    await updateFoodOrderStatus(db, old.id, "ready");
    await applyOps(db, [pickupOp(klaus, old.id, [[wurst, "Bratwurst", 1, 300]])], { ...ctx, now: new Date("2026-09-01T19:05:00Z") });

    await orderId(peter, [[wurst, 1]]); // löst das Aufräumen aus
    expect((await db.select().from(foodOrder)).map((o) => o.memberId)).toEqual([peter]);
    expect(await db.select().from(foodOrderLine)).toHaveLength(1);
    expect(await db.select().from(sale)).toHaveLength(1);
  });
});

describe("Theke", () => {
  it("zeigt offene Bestellungen und markiert sie als angekommen", async () => {
    await orderId(klaus, [[wurst, 2]], "mit Senf");
    const rejected = await orderId(peter, [[fisch, 1]]);
    await updateFoodOrderStatus(db, rejected, "reject", "Ist leider aus");

    const t = await getThekeOrders(db, now);
    expect(t.kitchenOpen).toBe(true);
    expect(t.orderableCount).toBe(2);
    expect(t.orders).toHaveLength(1);
    expect(t.orders[0]).toMatchObject({ memberName: "Klaus Müller", status: "new", note: "mit Senf" });
    expect(t.orders[0].lines).toEqual([{ articleId: wurst, articleName: "Bratwurst", quantity: 2, unitPriceCents: 300 }]);
    expect((await getMemberOrders(db, klaus, now)).orders[0].seen).toBe(true);
    expect((await getMemberOrders(db, peter, now)).orders[0]).toMatchObject({ status: "rejected", rejectReason: "Ist leider aus" });
  });

  it("Annehmen → Fertig → Abgeholt bucht beim Abholen (angeschrieben)", async () => {
    const a = await orderId(klaus, [[wurst, 2]]);
    expect(await updateFoodOrderStatus(db, a, "accept")).toEqual({ ok: true });
    expect(await updateFoodOrderStatus(db, a, "ready")).toEqual({ ok: true });
    expect((await getMemberStand(db, { id: klaus, name: "Klaus Müller" }, now)).orderStatus).toBe("ready");

    // Preis beim Abholen zählt
    const op = pickupOp(klaus, a, [[wurst, "Bratwurst", 2, 320]]);
    expect(await applyOps(db, [op], ctx)).toEqual([{ id: op.id, status: "ok" }]);
    const [o] = await db.select().from(foodOrder);
    expect(o).toMatchObject({ status: "picked_up", saleId: op.id });
    const stand = await getMemberStand(db, { id: klaus, name: "Klaus Müller" }, now);
    expect(stand.openCents).toBe(640);
    expect(stand.orderStatus).toBeNull();
    expect((await getThekeOrders(db, now)).orders).toHaveLength(0);
  });

  it("zweimal abholen bucht nur einmal", async () => {
    const a = await orderId(klaus, [[wurst, 1]]);
    const op = pickupOp(klaus, a, [[wurst, "Bratwurst", 1, 300]]);
    await applyOps(db, [op], ctx);
    expect(await applyOps(db, [op], ctx)).toEqual([{ id: op.id, status: "duplicate" }]);
    // zweites Tablet mit eigenem Bon
    const other = pickupOp(klaus, a, [[wurst, "Bratwurst", 1, 300]]);
    expect(await applyOps(db, [other], ctx)).toEqual([
      { id: other.id, status: "rejected", message: "Bestellung wurde schon abgeholt" },
    ]);
    expect(await db.select().from(sale)).toHaveLength(1);
  });

  it("abgelehnte oder zurückgezogene Bestellungen kann man nicht abholen", async () => {
    const a = await orderId(klaus, [[wurst, 1]]);
    await cancelFoodOrder(db, klaus, a);
    const op = pickupOp(klaus, a, [[wurst, "Bratwurst", 1, 300]]);
    expect(await applyOps(db, [op], ctx)).toEqual([
      { id: op.id, status: "rejected", message: "Bestellung wurde zurückgezogen" },
    ]);
    expect(await db.select().from(sale)).toHaveLength(0);
  });

  it("Abholen nur für das bestellende Mitglied", async () => {
    const a = await orderId(klaus, [[wurst, 1]]);
    const op = pickupOp(peter, a, [[wurst, "Bratwurst", 1, 300]]);
    expect(await applyOps(db, [op], ctx)).toMatchObject([{ status: "rejected" }]);
  });

  it("Ablehnen braucht einen Grund (Datenbank-Regel)", async () => {
    const a = await orderId(klaus, [[wurst, 1]]);
    await expect(updateFoodOrderStatus(db, a, "reject", "")).rejects.toThrow();
  });

  it("Küchen-Schalter wird gespeichert", async () => {
    await setKitchenOpen(db, false);
    const [s] = await db.select({ k: settings.kitchenOpen }).from(settings);
    expect(s.k).toBe(false);
  });
});

describe("Bierdeckel-Stand", () => {
  it("zeigt „Küche offen“ und den Stand der eigenen Bestellung", async () => {
    const m = { id: klaus, name: "Klaus Müller" };
    expect(await getMemberStand(db, m, now)).toMatchObject({ kitchenOpen: true, orderStatus: null });
    await orderId(klaus, [[wurst, 1]]);
    expect((await getMemberStand(db, m, now)).orderStatus).toBe("new");
    await setKitchenOpen(db, false);
    expect((await getMemberStand(db, m, now)).kitchenOpen).toBe(false);
  });
});
