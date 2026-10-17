import { asc, between, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, category, event, member, payment, paymentMethod, purchase, purchaseLine, sale, saleLine } from "@/db/schema";
import { csvDate, csvEuro, csvNumber, yesNo } from "@/domain/csv";
import { SOURCE_LABEL } from "@/domain/purchase";
import type { Period } from "@/domain/report";
import { isServed } from "@/domain/stock";
import { formatTimeBerlin } from "@/lib/date";
import { listOpenBalances } from "./queries/members";
import { getPeriodReport, listEvenings } from "./reports";
import { getStockOverview } from "./stock";

/**
 * CSV-Exporte der Verwaltung. Jeder Export liefert Zeilen (erste Zeile = Überschriften);
 * `period` gilt für alles mit Datum (Abend bzw. Einkaufsdatum), Bestand und Mitglieder sind „jetzt“.
 */
export const EXPORTS = {
  buchungen: { label: "Buchungen (alle Bon-Positionen)", period: true },
  zahlungen: { label: "Zahlungen", period: true },
  abende: { label: "Abende (Abendabschlüsse)", period: true },
  artikel: { label: "Artikel-Auswertung", period: true },
  einkaeufe: { label: "Einkäufe", period: true },
  bestand: { label: "Bestand und Warenwert (heute)", period: false },
  mitglieder: { label: "Mitglieder mit offenem Betrag (heute)", period: false },
} as const;
export type ExportKind = keyof typeof EXPORTS;

type Rows = (string | number)[][];
const time = (d: Date) => formatTimeBerlin(d.toISOString());

export async function buildExport(db: Db, kind: ExportKind, period: Period): Promise<Rows> {
  const inPeriod = between(event.businessDate, period.from, period.to);
  switch (kind) {
    case "buchungen": {
      const rows = await db
        .select({ line: saleLine, sale, day: event.businessDate, memberName: member.name, categoryName: category.name })
        .from(saleLine)
        .innerJoin(sale, eq(sale.id, saleLine.saleId))
        .innerJoin(event, eq(event.id, sale.eventId))
        .innerJoin(member, eq(member.id, sale.memberId))
        .innerJoin(article, eq(article.id, saleLine.articleId))
        .innerJoin(category, eq(category.id, article.categoryId))
        .where(inPeriod)
        .orderBy(asc(sale.createdAt));
      return [
        ["Abend", "Uhrzeit", "Bon", "Mitglied", "Artikel", "Kategorie", "Menge", "Einzelpreis", "Summe", "Gast", "Storno", "Grund"],
        ...rows.map((r) => [
          csvDate(r.day),
          time(r.sale.createdAt),
          r.sale.id.slice(0, 8),
          r.memberName,
          r.line.articleName,
          r.categoryName,
          r.line.quantity,
          csvEuro(r.line.unitPriceCents),
          csvEuro(r.line.totalCents),
          yesNo(r.line.isGuest),
          yesNo(r.line.reversesLineId !== null),
          r.line.reversesLineId ? (r.sale.reason ?? "") : "",
        ]),
      ];
    }
    case "zahlungen": {
      const rows = await db
        .select({ payment, day: event.businessDate, memberName: member.name, method: paymentMethod.label })
        .from(payment)
        .innerJoin(event, eq(event.id, payment.eventId))
        .innerJoin(member, eq(member.id, payment.memberId))
        .innerJoin(paymentMethod, eq(paymentMethod.id, payment.methodId))
        .where(inPeriod)
        .orderBy(asc(payment.createdAt));
      return [
        ["Abend", "Uhrzeit", "Mitglied", "Zahlungsart", "Betrag fürs Konto", "Trinkgeld", "Eingenommen", "Bar gegeben", "Storno", "Grund"],
        ...rows.map(({ payment: p, day, memberName, method }) => [
          csvDate(day),
          time(p.createdAt),
          memberName,
          method,
          csvEuro(p.amountCents),
          csvEuro(p.tipCents),
          csvEuro(p.amountCents + p.tipCents),
          p.cashGivenCents === null ? "" : csvEuro(p.cashGivenCents),
          yesNo(p.reversesPaymentId !== null),
          p.reason ?? "",
        ]),
      ];
    }
    case "abende": {
      const evenings = (await listEvenings(db, 10_000)).filter((e) => e.businessDate >= period.from && e.businessDate <= period.to).reverse();
      return [
        ["Abend", "Name", "Umsatz", "Bezahlt", "Trinkgeld", "Rohgewinn", "Einkaufspreis fehlt"],
        ...evenings.map((e) => [csvDate(e.businessDate), e.title ?? "", csvEuro(e.revenueCents), csvEuro(e.paidCents), csvEuro(e.tipCents), csvEuro(e.profitCents), yesNo(e.profitIncomplete)]),
      ];
    }
    case "artikel": {
      const r = await getPeriodReport(db, period);
      const cat = new Map(r.categories.map((c) => [c.id, c.name]));
      return [
        ["Artikel", "Kategorie", "Menge", "Umsatz", "Wareneinsatz", "Rohgewinn"],
        ...r.summary.articles.map((a) => [
          a.name,
          cat.get(a.categoryId) ?? "",
          a.quantity,
          csvEuro(a.revenueCents),
          a.costCents === null ? "" : csvEuro(a.costCents),
          a.costCents === null ? "" : csvEuro(a.revenueCents - a.costCents),
        ]),
      ];
    }
    case "einkaeufe": {
      const rows = await db
        .select({ purchase, line: purchaseLine, articleName: article.name })
        .from(purchaseLine)
        .innerJoin(purchase, eq(purchase.id, purchaseLine.purchaseId))
        .leftJoin(article, eq(article.id, purchaseLine.articleId))
        .where(between(purchase.purchasedOn, period.from, period.to))
        .orderBy(asc(purchase.purchasedOn), asc(purchase.createdAt));
      return [
        ["Datum", "Herkunft", "Notiz", "Artikel", "Beschreibung", "Menge", "Flaschengröße (ml)", "Preis", "Storno", "Grund"],
        ...rows.map(({ purchase: p, line: l, articleName }) => [
          csvDate(p.purchasedOn),
          SOURCE_LABEL[p.source],
          p.note ?? "",
          articleName ?? "",
          l.description,
          l.quantity,
          l.bottleMl ?? "",
          l.totalCents === null ? "" : csvEuro(l.totalCents),
          yesNo(p.reversesPurchaseId !== null),
          p.reason ?? "",
        ]),
      ];
    }
    case "bestand": {
      const { rows } = await getStockOverview(db);
      return [
        ["Artikel", "Kategorie", "Notiz", "Bestand", "Einheit", "Warenwert"],
        ...rows.map((r) => [
          r.name,
          r.categoryName,
          r.note ?? "",
          isServed(r) ? csvNumber(r.stock / 1000) : r.stock,
          isServed(r) ? "Liter" : "Stück",
          r.valueCents === null ? "" : csvEuro(r.valueCents),
        ]),
      ];
    }
    case "mitglieder": {
      const [all, open] = await Promise.all([
        db.select({ id: member.id, name: member.name, active: member.active }).from(member).where(isNull(member.anonymizedAt)).orderBy(asc(member.name)),
        listOpenBalances(db),
      ]);
      const openBy = new Map(open.map((m) => [m.id, m.openCents]));
      return [["Mitglied", "Aktiv", "Offen"], ...all.map((m) => [m.name, yesNo(m.active), csvEuro(openBy.get(m.id) ?? 0)])];
    }
  }
}
