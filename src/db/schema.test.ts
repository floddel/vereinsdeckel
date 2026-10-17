import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./client";
import {
  article,
  cashMovement,
  event,
  member,
  memberToken,
  payment,
  sale,
  saleLine,
} from "./schema";
import { createTestDb } from "./test-db";

let db: Db;
let memberId: string;
let eventId: string;
let articleId: string;

beforeEach(async () => {
  db = await createTestDb();
  [{ id: memberId }] = await db.insert(member).values({ name: "Klaus" }).returning();
  [{ id: eventId }] = await db.insert(event).values({ businessDate: "2026-10-14" }).returning();
  [{ id: articleId }] = await db
    .insert(article)
    .values({ name: "Pils", categoryId: "getraenke", priceCents: 200 })
    .returning();
});

async function bookBeer(quantity = 1) {
  const saleId = randomUUID();
  const lineId = randomUUID();
  await db.insert(sale).values({ id: saleId, memberId, eventId, kind: "sale", createdAt: new Date() });
  await db.insert(saleLine).values({
    id: lineId,
    saleId,
    articleId,
    articleName: "Pils",
    quantity,
    unitPriceCents: 200,
    totalCents: quantity * 200,
  });
  return { saleId, lineId };
}

/** Drizzle verpackt Datenbankfehler; die eigentliche Meldung steckt in `cause`. */
async function dbError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    const err = e as Error & { cause?: Error };
    return `${err.message} ${err.cause?.message ?? ""}`;
  }
  throw new Error("Datenbank hat die Anweisung unerwartet angenommen");
}

describe("append-only", () => {
  it("verbietet das Ändern einer Buchung", async () => {
    const { lineId } = await bookBeer();
    const msg = await dbError(
      db.update(saleLine).set({ quantity: 5, totalCents: 1000 }).where(eq(saleLine.id, lineId)),
    );
    expect(msg).toMatch(/append-only/);
  });

  it("verbietet das Löschen von Buchungen und Zahlungen", async () => {
    const { saleId } = await bookBeer();
    expect(await dbError(db.delete(saleLine))).toMatch(/append-only/);
    expect(await dbError(db.delete(sale).where(eq(sale.id, saleId)))).toMatch(/append-only/);

    await db.insert(payment).values({
      id: randomUUID(),
      memberId,
      eventId,
      methodId: "cash",
      amountCents: 200,
      createdAt: new Date(),
    });
    expect(await dbError(db.delete(payment))).toMatch(/append-only/);
    expect(await dbError(db.execute(sql`truncate payment cascade`))).toMatch(/append-only/);
  });

  it("verbietet das Ändern von Kassenbewegungen", async () => {
    const [m] = await db
      .insert(cashMovement)
      .values({ potId: "cash", type: "deposit", amountCents: 5000, note: "Wechselgeld" })
      .returning();
    expect(
      await dbError(db.update(cashMovement).set({ amountCents: 1 }).where(eq(cashMovement.id, m.id))),
    ).toMatch(/append-only/);
  });

  it("Stammdaten bleiben änderbar", async () => {
    await db.update(article).set({ priceCents: 250 }).where(eq(article.id, articleId));
    const [a] = await db.select().from(article).where(eq(article.id, articleId));
    expect(a.priceCents).toBe(250);
  });
});

describe("Prüfregeln", () => {
  it("doppelte ID wird beim Sync einfach ignoriert (keine Doppelbuchung)", async () => {
    const id = randomUUID();
    const row = { id, memberId, eventId, kind: "sale" as const, createdAt: new Date() };
    await db.insert(sale).values(row).onConflictDoNothing();
    await db.insert(sale).values(row).onConflictDoNothing();
    const rows = await db.select().from(sale).where(eq(sale.id, id));
    expect(rows).toHaveLength(1);
  });

  it("Gesamtpreis muss Menge × Preis sein", async () => {
    const saleId = randomUUID();
    await db.insert(sale).values({ id: saleId, memberId, eventId, kind: "sale", createdAt: new Date() });
    const msg = await dbError(
      db.insert(saleLine).values({
        id: randomUUID(),
        saleId,
        articleId,
        articleName: "Pils",
        quantity: 2,
        unitPriceCents: 200,
        totalCents: 300,
      }),
    );
    expect(msg).toMatch(/sale_line_total/);
  });

  it("Storno braucht eine Begründung", async () => {
    const msg = await dbError(
      db.insert(sale).values({
        id: randomUUID(),
        memberId,
        eventId,
        kind: "reversal",
        reason: "  ",
        createdAt: new Date(),
      }),
    );
    expect(msg).toMatch(/sale_reversal_reason/);
  });

  it("Storno-Position muss negativ sein und auf das Original verweisen", async () => {
    const { lineId } = await bookBeer();
    const reversalId = randomUUID();
    await db.insert(sale).values({
      id: reversalId,
      memberId,
      eventId,
      kind: "reversal",
      reason: "Falsch getippt",
      createdAt: new Date(),
    });
    const base = { saleId: reversalId, articleId, articleName: "Pils", unitPriceCents: 200 };
    // positiv mit Verweis → abgelehnt
    expect(
      await dbError(
        db.insert(saleLine).values({ ...base, id: randomUUID(), quantity: 1, totalCents: 200, reversesLineId: lineId }),
      ),
    ).toMatch(/sale_line_reversal_sign/);
    // negativ mit Verweis → ok
    await db
      .insert(saleLine)
      .values({ ...base, id: randomUUID(), quantity: -1, totalCents: -200, reversesLineId: lineId });
  });

  it("Zahlung: kein negativer Betrag ohne Storno, Storno nur mit Begründung", async () => {
    const base = { memberId, eventId, methodId: "cash", createdAt: new Date() };
    expect(
      await dbError(db.insert(payment).values({ ...base, id: randomUUID(), amountCents: -100 })),
    ).toMatch(/payment_sign/);
    const [p] = await db
      .insert(payment)
      .values({ ...base, id: randomUUID(), amountCents: 1450, tipCents: 50 })
      .returning();
    expect(
      await dbError(
        db.insert(payment).values({ ...base, id: randomUUID(), amountCents: -1450, tipCents: -50, reversesPaymentId: p.id }),
      ),
    ).toMatch(/payment_sign/);
    await db.insert(payment).values({
      ...base,
      id: randomUUID(),
      amountCents: -1450,
      tipCents: -50,
      reversesPaymentId: p.id,
      reason: "Falsches Mitglied",
    });
  });

  it("nur ein aktiver Link pro Mitglied", async () => {
    const token = () => randomUUID() + randomUUID();
    await db.insert(memberToken).values({ memberId, token: token() });
    expect(await dbError(db.insert(memberToken).values({ memberId, token: token() }))).toMatch(
      /member_token_one_active/,
    );
  });

  it("Grunddaten sind vorhanden", async () => {
    const methods = await db.query.paymentMethod.findMany();
    expect(methods.map((m) => [m.id, m.potId])).toEqual([
      ["cash", "cash"],
      ["paypal", "paypal"],
    ]);
  });
});
