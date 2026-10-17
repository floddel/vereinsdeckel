import { randomUUID } from "node:crypto";
import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { article, member } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { buildCashBook } from "@/domain/cash-book";
import { getMemberReceipt, getMemberStatement } from "../member-view";
import { getEveningReport } from "../reports";
import { applyOps } from "../theke/apply-ops";
import { CashBookPdf, EveningPdf, ReceiptPdf, StatementPdf } from "./documents";
import { loadBrand } from "./parts";

const isPdf = (b: Uint8Array) => Buffer.from(b.subarray(0, 5)).toString() === "%PDF-" && b.length > 1500;

describe("PDFs", () => {
  it("Abendabschluss, Kassenbuch, Kontoauszug und Kassenzettel lassen sich erzeugen", async () => {
    const db = await createTestDb();
    const [{ id: klaus }] = await db.insert(member).values({ name: "Klaus Müller" }).returning();
    const [{ id: pils }] = await db.insert(article).values({ name: "Pils", categoryId: "getraenke", priceCents: 150, trackStock: false }).returning();
    const at = "2026-10-15T19:00:00.000Z";
    await applyOps(
      db,
      [
        { type: "sale", id: randomUUID(), memberId: klaus, createdAt: at, lines: [{ id: randomUUID(), articleId: pils, articleName: "Pils", quantity: 3, unitPriceCents: 150, isGuest: false }] },
        { type: "payment", id: randomUUID(), memberId: klaus, createdAt: at, methodId: "cash", amountCents: 450, tipCents: 50, cashGivenCents: 500, saleId: null },
      ],
      { deviceId: "t", cutoffHour: 6, now: new Date(at) },
    );
    const brand = await loadBrand(db);
    expect(brand).toEqual({ clubName: "Mein Verein", logo: null });

    const report = (await getEveningReport(db, "2026-10-15"))!;
    expect(isPdf(await renderToBuffer(EveningPdf({ brand, r: report })))).toBe(true);

    const book = buildCashBook([{ date: "2026-10-15", at: new Date(at), kind: "evening", title: "Einnahmen Abend", detail: "1 Zahlung", amountCents: 500 }], "2026-01-01", "2026-12-31");
    expect(isPdf(await renderToBuffer(CashBookPdf({ brand, potName: "Handkasse", from: "2026-01-01", to: "2026-12-31", book })))).toBe(true);

    const st = await getMemberStatement(db, klaus, "2026-01-01", "2026-12-31");
    expect(st).toMatchObject({ openingCents: 0, closingCents: 0 });
    expect(st.receipts).toHaveLength(1);
    expect(isPdf(await renderToBuffer(StatementPdf({ brand, st: { memberName: "Klaus Müller", from: "2026-01-01", to: "2026-12-31", ...st } })))).toBe(true);

    const receipt = (await getMemberReceipt(db, klaus, "2026-10-15"))!;
    expect(receipt).toMatchObject({ totalCents: 450, paidCents: 450, tipCents: 50 });
    expect(isPdf(await renderToBuffer(ReceiptPdf({ clubName: brand.clubName, memberName: "Klaus Müller", receipt })))).toBe(true);
    expect(await getMemberReceipt(db, klaus, "2026-10-16")).toBeNull();
  }, 30_000);
});
