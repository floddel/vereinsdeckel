import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { CashBook } from "@/domain/cash-book";
import type { Receipt } from "@/domain/member-view";
import { formatBusinessDayNumeric, formatTimeBerlin } from "@/lib/date";
import { formatCents } from "@/lib/money";
import type { EveningReport } from "../reports";
import { A4, type Brand, COLOR, Figures, s, Table } from "./parts";

// PDF-Standardschriften kennen kein schmales Leerzeichen vor „€“ – normales Leerzeichen verwenden
const eur = (c: number) => formatCents(c).replace(" ", " ");

// ---------------------------------------------------------------------------
// Abendabschluss
// ---------------------------------------------------------------------------

export function EveningPdf({ brand, r }: { brand: Brand; r: EveningReport }) {
  const x = r.summary;
  const catName = new Map(r.categories.map((c) => [c.id, c.name]));
  const onDeckel = x.revenueCents - x.paidCents;
  return (
    <A4
      brand={brand}
      title={`Abendabschluss ${formatBusinessDayNumeric(r.event.businessDate)}`}
      subtitle={[r.event.title, `${r.receipts} Bons · ${r.members} Mitglieder bedient`, r.event.note].filter(Boolean).join(" · ")}
    >
      <Figures
        items={[
          { label: "Umsatz", value: eur(x.revenueCents), hint: x.reversedCents ? `nach Stornos (-${eur(x.reversedCents)})` : undefined },
          { label: "Bezahlt (fürs Konto)", value: eur(x.paidCents) },
          { label: "Trinkgeld", value: eur(x.tipCents) },
          { label: onDeckel >= 0 ? "Neu auf den Deckeln" : "Mehr bezahlt als verkauft", value: eur(Math.abs(onDeckel)) },
          { label: "Wareneinsatz", value: eur(x.costCents), hint: "zum Ø Einkaufspreis" },
          { label: "Rohgewinn", value: eur(x.profitCents), hint: "Umsatz minus Wareneinsatz" },
        ]}
      />

      <Text style={s.h2}>Einnahmen</Text>
      <Table
        columns={[
          { label: "Zahlungsart", flex: 3 },
          { label: "fürs Konto", flex: 2, align: "right" },
          { label: "Trinkgeld", flex: 2, align: "right" },
          { label: "eingenommen", flex: 2, align: "right" },
        ]}
        rows={r.methods
          .filter((m) => x.byMethod[m.id])
          .map((m) => {
            const v = x.byMethod[m.id];
            return [m.label, eur(v.amountCents), eur(v.tipCents), eur(v.amountCents + v.tipCents)];
          })}
      />

      <Text style={s.h2}>Verkauft{x.guestCents ? ` – davon für Gäste ${eur(x.guestCents)}` : ""}</Text>
      <Table
        columns={[
          { label: "Artikel", flex: 4 },
          { label: "Kategorie", flex: 2 },
          { label: "Menge", flex: 1, align: "right" },
          { label: "Umsatz", flex: 2, align: "right" },
          { label: "Wareneinsatz", flex: 2, align: "right" },
          { label: "Rohgewinn", flex: 2, align: "right" },
        ]}
        rows={x.articles.map((a) => [
          a.name,
          catName.get(a.categoryId) ?? "",
          a.quantity,
          eur(a.revenueCents),
          a.costCents === null ? "–" : eur(a.costCents),
          a.costCents === null ? "–" : eur(a.revenueCents - a.costCents),
        ])}
      />
      {x.uncostedRevenueCents !== 0 && (
        <Text style={[s.muted, { marginTop: 4 }]}>„–“: noch kein Einkaufspreis bekannt – dort fehlt der Wareneinsatz, der Rohgewinn ist etwas zu hoch.</Text>
      )}

      {r.reversals.length > 0 && (
        <>
          <Text style={s.h2}>Stornos – zusammen {eur(x.reversedCents)}</Text>
          <Table
            columns={[
              { label: "Zeit", flex: 1 },
              { label: "Mitglied", flex: 3 },
              { label: "Positionen", flex: 4 },
              { label: "Grund", flex: 3 },
              { label: "Betrag", flex: 2, align: "right" },
            ]}
            rows={r.reversals.map((v) => [formatTimeBerlin(v.at.toISOString()), v.memberName, v.items, v.reason, `-${eur(v.totalCents)}`])}
          />
        </>
      )}
    </A4>
  );
}

// ---------------------------------------------------------------------------
// Kassenbuch
// ---------------------------------------------------------------------------

export function CashBookPdf({ brand, potName, from, to, book }: { brand: Brand; potName: string; from: string; to: string; book: CashBook }) {
  return (
    <A4 brand={brand} title={`Kassenbuch ${potName}`} subtitle={`${formatBusinessDayNumeric(from)} – ${formatBusinessDayNumeric(to)}`}>
      <Figures
        items={[
          { label: "Übertrag (Anfangsbestand)", value: eur(book.openingCents) },
          { label: "Eingänge / Ausgänge", value: `+${eur(book.inCents)}`, hint: `-${eur(book.outCents)}` },
          { label: "Bestand am Ende (Soll)", value: eur(book.closingCents) },
        ]}
      />
      <Text style={s.h2}>Buchungen</Text>
      <Table
        columns={[
          { label: "Datum", flex: 2 },
          { label: "Vorgang", flex: 4 },
          { label: "Erläuterung", flex: 6 },
          { label: "Betrag", flex: 2, align: "right" },
          { label: "Bestand", flex: 2, align: "right" },
        ]}
        rows={[
          ["", "Übertrag", "", "", eur(book.openingCents)],
          ...book.rows.map((r) => [r.date.split("-").reverse().join("."), r.title, r.detail, `${r.amountCents > 0 ? "+" : ""}${eur(r.amountCents)}`, eur(r.balanceCents)]),
        ]}
        bold={(i) => i === 0}
      />
      {book.rows.length === 0 && <Text style={[s.muted, { marginTop: 6 }]}>Keine Buchungen in diesem Zeitraum.</Text>}
    </A4>
  );
}

// ---------------------------------------------------------------------------
// Kontoauszug eines Mitglieds
// ---------------------------------------------------------------------------

export interface Statement {
  memberName: string;
  from: string;
  to: string;
  openingCents: number;
  /** Kassenzettel im Zeitraum, älteste zuerst */
  receipts: Receipt[];
  closingCents: number;
}

export function StatementPdf({ brand, st }: { brand: Brand; st: Statement }) {
  const consumed = st.receipts.reduce((sum, r) => sum + r.totalCents, 0);
  const paid = st.receipts.reduce((sum, r) => sum + r.paidCents, 0);
  return (
    <A4 brand={brand} title={`Kontoauszug ${st.memberName}`} subtitle={`${formatBusinessDayNumeric(st.from)} – ${formatBusinessDayNumeric(st.to)}`}>
      <Figures
        items={[
          { label: "Offen am Anfang", value: eur(st.openingCents) },
          { label: "Verzehr / bezahlt", value: eur(consumed), hint: `bezahlt ${eur(paid)}` },
          { label: "Offen am Ende", value: eur(st.closingCents) },
        ]}
      />
      <Text style={s.h2}>Abende</Text>
      <Table
        columns={[
          { label: "Abend", flex: 3 },
          { label: "Verzehr", flex: 6 },
          { label: "Summe", flex: 2, align: "right" },
          { label: "Bezahlt", flex: 2, align: "right" },
          { label: "Offen danach", flex: 2, align: "right" },
        ]}
        rows={[
          ["", "Übertrag", "", "", eur(st.openingCents)],
          ...st.receipts.map((r) => [
            `${formatBusinessDayNumeric(r.businessDate)}${r.title ? `\n${r.title}` : ""}`,
            itemsText(r),
            eur(r.totalCents),
            eur(r.paidCents) + (r.tipCents ? `\n+ ${eur(r.tipCents)} Trinkgeld` : ""),
            eur(r.openAfterCents),
          ]),
        ]}
        bold={(i) => i === 0}
      />
      {st.receipts.length === 0 && <Text style={[s.muted, { marginTop: 6 }]}>Keine Buchungen in diesem Zeitraum.</Text>}
    </A4>
  );
}

/** „3× Pils, 1× Bockwurst (Gast), −1× Pils (Storno)“ – je Artikel zusammengefasst. */
function itemsText(r: Receipt): string {
  const sums = new Map<string, number>();
  for (const l of r.lines) {
    const key = `${l.articleName}${l.isGuest ? " (Gast)" : ""}`;
    sums.set(key, (sums.get(key) ?? 0) + l.quantity);
  }
  return [...sums]
    .filter(([, q]) => q !== 0)
    .map(([name, q]) => `${q}× ${name}`)
    .join(", ") || (r.lines.length ? "alles storniert" : "–");
}

// ---------------------------------------------------------------------------
// Kassenzettel (schmal wie ein Bon, Courier)
// ---------------------------------------------------------------------------

const r = StyleSheet.create({
  page: { paddingVertical: 18, paddingHorizontal: 14, fontFamily: "Courier", fontSize: 8.5, color: "#111" },
  center: { textAlign: "center" },
  line: { flexDirection: "row", justifyContent: "space-between" },
  rule: { borderBottomWidth: 0.75, borderBottomColor: "#111", borderStyle: "dashed", marginVertical: 5 },
  bold: { fontFamily: "Courier-Bold" },
});

const METHOD: Record<string, string> = { cash: "Bar", paypal: "PayPal" };

export function ReceiptPdf({ clubName, memberName, receipt }: { clubName: string; memberName: string; receipt: Receipt }) {
  // Höhe nach Inhalt (Bonrolle 80 mm breit)
  const rows = receipt.lines.length + receipt.payments.length * 2 + (receipt.title ? 1 : 0);
  return (
    <Document title={`Kassenzettel ${formatBusinessDayNumeric(receipt.businessDate)}`} author={clubName} creator="Vereinsdeckel" producer="Vereinsdeckel">
      <Page size={[227, 190 + rows * 12]} style={r.page}>
        <Text style={[r.center, r.bold, { fontSize: 11 }]}>{clubName}</Text>
        <Text style={r.center}>Kassenzettel</Text>
        <Text style={r.center}>{formatBusinessDayNumeric(receipt.businessDate)}</Text>
        {receipt.title && <Text style={r.center}>{receipt.title}</Text>}
        <View style={r.rule} />
        <Text style={r.bold}>{memberName}</Text>
        <View style={r.rule} />
        {receipt.lines.map((l, i) => (
          <View key={i} style={r.line}>
            <Text style={{ flex: 1 }}>
              {l.quantity}× {l.articleName}
              {l.isGuest ? " (Gast)" : ""}
              {l.reversal ? " STORNO" : ""}
            </Text>
            <Text>{eur(l.totalCents)}</Text>
          </View>
        ))}
        <View style={r.rule} />
        <View style={r.line}>
          <Text style={r.bold}>SUMME</Text>
          <Text style={r.bold}>{eur(receipt.totalCents)}</Text>
        </View>
        {receipt.payments.map((p, i) => (
          <View key={i}>
            <View style={r.line}>
              <Text>
                {p.reversal ? "Storno " : ""}bezahlt {METHOD[p.methodId] ?? p.methodId}
              </Text>
              <Text>{eur(p.amountCents)}</Text>
            </View>
            {p.tipCents !== 0 && (
              <View style={r.line}>
                <Text>Trinkgeld</Text>
                <Text>{eur(p.tipCents)}</Text>
              </View>
            )}
          </View>
        ))}
        <View style={r.rule} />
        <View style={r.line}>
          <Text style={r.bold}>Offen danach</Text>
          <Text style={r.bold}>{eur(receipt.openAfterCents)}</Text>
        </View>
        <View style={r.rule} />
        <Text style={[r.center, { color: COLOR.muted }]}>
          {formatTimeBerlin(receipt.from)}–{formatTimeBerlin(receipt.to)} Uhr · Danke!
        </Text>
      </Page>
    </Document>
  );
}
