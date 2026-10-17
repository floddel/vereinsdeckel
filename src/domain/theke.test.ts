import { describe, expect, it } from "vitest";
import {
  availableUnits,
  type BookedLine,
  buildThekeView,
  groupMembers,
  memberDeckel,
  memberLetter,
  paidToday,
  planSaleReversal,
  reversedQuantities,
  searchMembers,
  summarizePayments,
  summarizeSales,
  syncRequestSchema,
  type ThekeSnapshot,
} from "./theke";

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const KLAUS = U(1);
const PETER = U(2);
const PILS = U(10);
const WURST = U(11);
const at = "2026-10-15T19:00:00.000Z";

const line = (id: string, articleId: string, quantity: number, unitPriceCents: number, reversesLineId: string | null = null): BookedLine => ({
  id,
  articleId,
  articleName: articleId === PILS ? "Pils" : "Bratwurst",
  quantity,
  unitPriceCents,
  totalCents: quantity * unitPriceCents,
  isGuest: false,
  reversesLineId,
});

function snapshot(overrides: Partial<ThekeSnapshot> = {}): ThekeSnapshot {
  return {
    generatedAt: at,
    clubName: "Mein Verein",
    warnLimitCents: 3000,
    paypalName: null,
    paymentMethods: [{ id: "cash", label: "Bar" }],
    cutoffHour: 6,
    businessDate: "2026-10-15",
    categories: [],
    articles: [],
    members: [
      { id: KLAUS, name: "Klaus Müller", openCents: 500 },
      { id: PETER, name: "Peter Ähler", openCents: 0 },
    ],
    recentMemberIds: [PETER],
    todaySales: [],
    todayPayments: [],
    carried: {},
    ...overrides,
  };
}

describe("Vorgänge prüfen", () => {
  it("akzeptiert einen gültigen Bon und lehnt Unsinn ab", () => {
    const ok = syncRequestSchema.safeParse({
      deviceId: "tablet-1",
      ops: [{ type: "sale", id: U(100), memberId: KLAUS, createdAt: at, lines: [{ id: U(101), articleId: PILS, articleName: "Pils", quantity: 2, unitPriceCents: 200, isGuest: false }] }],
    });
    expect(ok.success).toBe(true);
    const bad = syncRequestSchema.safeParse({
      deviceId: "tablet-1",
      ops: [{ type: "sale", id: "abc", memberId: KLAUS, createdAt: at, lines: [{ id: U(101), articleId: PILS, articleName: "Pils", quantity: 0, unitPriceCents: -1, isGuest: false }] }],
    });
    expect(bad.success).toBe(false);
  });
});

describe("planSaleReversal", () => {
  const original = [line(U(201), PILS, 3, 200), line(U(202), WURST, 1, 300)];

  it("„all“ storniert alles, was noch offen ist", () => {
    const already = reversedQuantities([line(U(301), PILS, -1, 200, U(201))]);
    expect(planSaleReversal(original, already, "all").map((l) => [l.reversesLineId, l.quantity, l.totalCents])).toEqual([
      [U(201), -2, -400],
      [U(202), -1, -300],
    ]);
  });

  it("Teil-Storno einzelner Positionen, nie mehr als gebucht", () => {
    expect(planSaleReversal(original, new Map(), [{ lineId: U(201), quantity: 1 }])).toHaveLength(1);
    expect(() => planSaleReversal(original, new Map([[U(201), 3]]), [{ lineId: U(201), quantity: 1 }])).toThrow(/höchstens 0/);
    expect(() => planSaleReversal(original, new Map([[U(201), 3], [U(202), 1]]), "all")).toThrow(/vollständig storniert/);
    expect(() => planSaleReversal(original, new Map(), [{ lineId: U(999), quantity: 1 }])).toThrow(/gehört nicht/);
    // Dieselbe Position mehrfach: nicht mehr als gebucht stornieren
    expect(() =>
      planSaleReversal(original, new Map(), [
        { lineId: U(202), quantity: 1 },
        { lineId: U(202), quantity: 1 },
      ]),
    ).toThrow(/doppelt/);
  });
});

describe("buildThekeView", () => {
  const sale = {
    op: {
      type: "sale" as const,
      id: U(400),
      memberId: KLAUS,
      createdAt: at,
      lines: [{ id: U(401), articleId: PILS, articleName: "Pils", quantity: 2, unitPriceCents: 200, isGuest: false }],
    },
  };

  it("noch nicht bestätigter Bon erhöht sofort den offenen Betrag und macht anwesend", () => {
    const view = buildThekeView(snapshot(), [sale]);
    expect(view.membersById.get(KLAUS)?.openCents).toBe(900);
    expect(view.presentIds.has(KLAUS)).toBe(true);
    expect(view.recentMemberIds).toEqual([KLAUS, PETER]);
    expect(view.todaySales.at(-1)?.pending).toBe(true);
  });

  it("schon im Server-Stand enthaltene Vorgänge zählen nicht doppelt", () => {
    const snap = snapshot({
      members: [{ id: KLAUS, name: "Klaus Müller", openCents: 900 }],
      todaySales: [{ id: U(400), memberId: KLAUS, kind: "sale", reversesSaleId: null, reason: null, createdAt: at, lines: [line(U(401), PILS, 2, 200)] }],
    });
    expect(buildThekeView(snap, [sale]).membersById.get(KLAUS)?.openCents).toBe(900);
  });

  it("Rückgängig direkt nach dem Buchen (beides noch unterwegs) hebt sich auf", () => {
    const undo = { op: { type: "reversal" as const, id: U(402), saleId: U(400), createdAt: at, reason: "Sofort rückgängig", lines: "all" as const } };
    const view = buildThekeView(snapshot(), [sale, undo]);
    expect(view.membersById.get(KLAUS)?.openCents).toBe(500);
    // doppeltes Rückgängig wird ignoriert (Server lehnt ab)
    expect(buildThekeView(snapshot(), [sale, undo, { op: { ...undo.op, id: U(403) } }]).membersById.get(KLAUS)?.openCents).toBe(500);
  });

  it("Umbuchen verschiebt den Betrag zum anderen Mitglied", () => {
    const move = { op: { type: "move" as const, id: U(404), newSaleId: U(405), saleId: U(400), toMemberId: PETER, createdAt: at, lines: "all" as const } };
    const view = buildThekeView(snapshot(), [sale, move]);
    expect(view.membersById.get(KLAUS)?.openCents).toBe(500);
    expect(view.membersById.get(PETER)?.openCents).toBe(400);
    expect(view.todaySales.find((s) => s.id === U(404))?.reason).toBe("Umgebucht auf Peter Ähler");
  });
});

describe("Mitgliederauswahl", () => {
  const members = [
    { id: "a", name: "Klaus Müller" },
    { id: "b", name: "Ännchen Weiß" },
    { id: "c", name: "Peter Klausen" },
    { id: "d", name: "Jürgen Maier" },
  ];

  it("Anfangsbuchstaben ohne Umlaut-Punkte", () => {
    expect(memberLetter("Ännchen")).toBe("A");
    expect(memberLetter("ölf")).toBe("O");
    expect(memberLetter("3 Musketiere")).toBe("#");
  });

  it("Suche: Namensanfang vor Namensteil vor irgendwo, Umlaute egal", () => {
    expect(searchMembers(members, "klaus", new Set()).map((m) => m.id)).toEqual(["a", "c"]);
    expect(searchMembers(members, "annchen", new Set()).map((m) => m.id)).toEqual(["b"]);
    expect(searchMembers(members, "mai", new Set()).map((m) => m.id)).toEqual(["d"]);
    expect(searchMembers(members, "  ", new Set())).toEqual([]);
  });

  it("Suche bevorzugt Anwesende bei gleicher Güte", () => {
    const ms = [
      { id: "x", name: "Klaus A" },
      { id: "y", name: "Klaus B" },
    ];
    expect(searchMembers(ms, "kla", new Set(["y"])).map((m) => m.id)).toEqual(["y", "x"]);
  });

  it("gruppiert in zuletzt bedient, anwesend und übrige", () => {
    const g = groupMembers(members, new Set(["a", "d"]), ["d", "zzz", "b"], 8);
    expect(g.recent.map((m) => m.id)).toEqual(["d", "b"]);
    expect(g.present.map((m) => m.name)).toEqual(["Jürgen Maier", "Klaus Müller"]);
    expect(g.others.map((m) => m.name)).toEqual(["Ännchen Weiß", "Peter Klausen"]);
  });
});

describe("summarizeSales", () => {
  it("zeigt je Bon, was noch übrig ist, neueste zuerst", () => {
    const sales = [
      { id: U(500), memberId: KLAUS, kind: "sale" as const, reversesSaleId: null, reason: null, createdAt: at, lines: [line(U(501), PILS, 3, 200), line(U(502), WURST, 1, 300)] },
      { id: U(510), memberId: KLAUS, kind: "sale" as const, reversesSaleId: null, reason: null, createdAt: at, lines: [line(U(511), PILS, 1, 200)] },
      { id: U(520), memberId: KLAUS, kind: "reversal" as const, reversesSaleId: U(500), reason: "Falsch getippt", createdAt: at, lines: [line(U(521), PILS, -1, 200, U(501))] },
      { id: U(530), memberId: KLAUS, kind: "reversal" as const, reversesSaleId: U(510), reason: "Sofort rückgängig", createdAt: at, lines: [line(U(531), PILS, -1, 200, U(511))] },
    ];
    const [second, first] = summarizeSales(sales);
    expect(second.sale.id).toBe(U(510));
    expect(second.status).toBe("reversed");
    expect(second.totalCents).toBe(0);
    expect(first.status).toBe("partly-reversed");
    expect(first.totalCents).toBe(700);
    expect(first.lines.map((l) => [l.reversed, l.remaining])).toEqual([[1, 2], [0, 1]]);
    expect(first.reasons).toEqual(["Falsch getippt"]);
  });
});

describe("Zahlungen in der Ansicht", () => {
  const pay = (id: string, amountCents: number, tipCents = 0) => ({
    op: { type: "payment" as const, id, memberId: KLAUS, createdAt: at, methodId: "cash", amountCents, tipCents, cashGivenCents: null, saleId: null },
  });

  it("Zahlung mindert sofort den offenen Betrag, Zuviel wird Trinkgeld", () => {
    const view = buildThekeView(snapshot(), [pay(U(600), 800)]);
    expect(view.membersById.get(KLAUS)?.openCents).toBe(0);
    expect(view.todayPayments[0]).toMatchObject({ amountCents: 500, tipCents: 300, pending: true });
    expect(paidToday(view, KLAUS)).toBe(true);
  });

  it("Zahlungs-Storno stellt den offenen Betrag wieder her, nur einmal", () => {
    const rev = (id: string) => ({ op: { type: "payment-reversal" as const, id, paymentId: U(600), createdAt: at, reason: "Falsch getippt" } });
    const view = buildThekeView(snapshot(), [pay(U(600), 300), rev(U(601)), rev(U(602))]);
    expect(view.membersById.get(KLAUS)?.openCents).toBe(500);
    const [summary] = summarizePayments(view.todayPayments);
    expect(summary.reversal?.reason).toBe("Falsch getippt");
    expect(paidToday(view, KLAUS)).toBe(false);
  });
});

describe("memberDeckel (Auf dem Deckel)", () => {
  const carriedLine = (businessDate: string, articleName: string, quantity: number, unitPriceCents: number) => ({
    at: `${businessDate}T19:00:00.000Z`,
    businessDate,
    articleName,
    quantity,
    unitPriceCents,
    totalCents: quantity * unitPriceCents,
    isGuest: false,
  });

  it("zeigt frühere Abende und heute, gleiche Artikel zusammengefasst, neuester Abend zuerst", () => {
    const snap = snapshot({
      members: [{ id: KLAUS, name: "Klaus Müller", openCents: 1300 }],
      carried: {
        [KLAUS]: { lines: [carriedLine("2026-10-08", "Pils", 2, 200), carriedLine("2026-10-08", "Pils", 1, 200)], paidCents: 0 },
      },
    });
    const view = buildThekeView(snap, [
      {
        op: {
          type: "sale",
          id: U(50),
          memberId: KLAUS,
          createdAt: at,
          lines: [
            { id: U(51), articleId: WURST, articleName: "Bratwurst", quantity: 2, unitPriceCents: 300, isGuest: false },
            { id: U(52), articleId: PILS, articleName: "Pils", quantity: 1, unitPriceCents: 200, isGuest: true },
          ],
        },
      },
    ]);
    expect(memberDeckel(snap, view, KLAUS)).toEqual({
      evenings: [
        {
          businessDate: "2026-10-15",
          items: [
            { articleName: "Bratwurst", quantity: 2, totalCents: 600, isGuest: false },
            { articleName: "Pils", quantity: 1, totalCents: 200, isGuest: true },
          ],
        },
        { businessDate: "2026-10-08", items: [{ articleName: "Pils", quantity: 3, totalCents: 600, isGuest: false }] },
      ],
      paidCents: 0,
    });
  });

  it("Teilzahlung: Posten bleiben stehen, Bezahltes wird ausgewiesen", () => {
    const snap = snapshot({
      members: [{ id: KLAUS, name: "Klaus Müller", openCents: 400 }],
      carried: { [KLAUS]: { lines: [carriedLine("2026-10-08", "Pils", 5, 200)], paidCents: 600 } },
    });
    const deckel = memberDeckel(snap, buildThekeView(snap, []), KLAUS);
    expect(deckel.evenings).toHaveLength(1);
    expect(deckel.paidCents).toBe(600);
  });

  it("heute beglichen: Deckel ist leer, auch frühere Abende", () => {
    const snap = snapshot({
      members: [{ id: KLAUS, name: "Klaus Müller", openCents: 600 }],
      carried: { [KLAUS]: { lines: [carriedLine("2026-10-08", "Pils", 3, 200)], paidCents: 0 } },
    });
    const view = buildThekeView(snap, [
      {
        op: { type: "payment", id: U(60), memberId: KLAUS, createdAt: at, methodId: "cash", amountCents: 600, tipCents: 0, cashGivenCents: null, saleId: null },
      },
    ]);
    expect(memberDeckel(snap, view, KLAUS)).toEqual({ evenings: [], paidCents: 0 });
  });

  it("Storno von heute wird verrechnet", () => {
    const snap = snapshot({
      members: [{ id: KLAUS, name: "Klaus Müller", openCents: 200 }],
      todaySales: [
        { id: U(70), memberId: KLAUS, kind: "sale", reversesSaleId: null, reason: null, createdAt: at, lines: [line(U(71), PILS, 2, 200)] },
        { id: U(72), memberId: KLAUS, kind: "reversal", reversesSaleId: U(70), reason: "Falsch getippt", createdAt: at, lines: [line(U(73), PILS, -1, 200, U(71))] },
      ],
    });
    expect(memberDeckel(snap, buildThekeView(snap, []), KLAUS).evenings).toEqual([
      { businessDate: "2026-10-15", items: [{ articleName: "Pils", quantity: 1, totalCents: 200, isGuest: false }] },
    ]);
  });
});

describe("Nur verkaufen, was da ist", () => {
  const GLAS = U(12);
  const FLASCHE = U(13);
  const pilsStock = { pool: PILS, perUnit: 1 };
  const glasStock = { pool: GLAS, perUnit: 250 };
  const flascheStock = { pool: GLAS, perUnit: 1000 };
  const articles = [
    { id: PILS, name: "Pils", categoryId: "getraenke", icon: "beer", priceCents: 200, stock: pilsStock },
    { id: WURST, name: "Bratwurst", categoryId: "essen", icon: "sausage", priceCents: 300, stock: null },
    { id: GLAS, name: "Wein Glas", categoryId: "getraenke", icon: "wine", priceCents: 250, stock: glasStock },
    { id: FLASCHE, name: "Wein Flasche", categoryId: "getraenke", icon: "wine", priceCents: 800, stock: flascheStock },
  ];
  const sale = (id: number, articleId: string, quantity: number) => ({
    op: {
      type: "sale" as const,
      id: U(id),
      memberId: KLAUS,
      createdAt: at,
      lines: [{ id: U(id + 1), articleId, articleName: "x", quantity, unitPriceCents: 200, isGuest: false }],
    },
  });

  it("noch nicht gesendete Verkäufe mindern den Bestand, Stornos geben zurück", () => {
    const snap = snapshot({ articles, stock: { [PILS]: 5, [GLAS]: 2000 } });
    const view = buildThekeView(snap, [sale(100, PILS, 2), sale(110, FLASCHE, 1)]);
    expect(view.stockLeft.get(PILS)).toBe(3);
    expect(view.stockLeft.get(GLAS)).toBe(1000);
    const undo = { op: { type: "reversal" as const, id: U(120), saleId: U(100), createdAt: at, reason: "Versehen", lines: "all" as const } };
    expect(buildThekeView(snap, [sale(100, PILS, 2), undo]).stockLeft.get(PILS)).toBe(5);
  });

  it("verfügbar = Bestand − Warenkorb (auch andere Artikel aus demselben Bestand)", () => {
    const left = new Map([
      [PILS, 3],
      [GLAS, 1000],
    ]);
    expect(availableUnits(articles[0], left, [])).toBe(3);
    expect(availableUnits(articles[0], left, [{ article: articles[0], quantity: 3 }])).toBe(0);
    // 1 l Wein: 4 Gläser – oder eine Flasche; mit 1 Glas im Korb keine Flasche mehr
    expect(availableUnits(articles[2], left, [])).toBe(4);
    expect(availableUnits(articles[3], left, [{ article: articles[2], quantity: 1 }])).toBe(0);
    // ohne Bestandsführung unbegrenzt, fehlender Bestand = 0
    expect(availableUnits(articles[1], left, [])).toBe(Number.POSITIVE_INFINITY);
    expect(availableUnits(articles[0], new Map(), [])).toBe(0);
  });
});
