import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { article, authAccount, authUser, cashMovement, event, member, memberToken, purchase, purchaseLine, settings } from "@/db/schema";
import { insertStarterArticles } from "@/db/setup";
import { businessDate, CLUB_TIME_ZONE } from "@/domain/business-date";
import type { SaleOp, ThekeOp } from "@/domain/theke";
import { DEMO_LOGIN } from "@/lib/demo";
import { hashPin } from "@/lib/pin";
import { createFoodOrder } from "./food-orders";
import { applyOps } from "./theke/apply-ops";

/**
 * Beispieldaten für den Demo-Betrieb (DEMO_MODE=1): der erfundene „TSV Musterstadt“ mit Mitgliedern,
 * drei vergangenen Abenden, offenen Deckeln von heute, Tagesgericht, Tipp des Hauses und einer
 * Handy-Bestellung. Alle Zeiten liegen relativ zum Start, damit „heute“ immer heute ist.
 */

const CUTOFF_HOUR = 6;

const MEMBERS = [
  "Heinz Zimmermann", "Klaus Becker", "Petra Schulz", "Jürgen Hoffmann", "Sabine Wolf", "Uwe Krüger",
  "Monika Neumann", "Dieter Schäfer", "Gabi Braun", "Frank Hartmann", "Andrea Lange", "Thomas Köhler",
  "Karin Schmitt", "Michael Weber", "Birgit Lehmann", "Stefan Krause", "Renate Fuchs", "Holger Vogel",
  "Ute Jäger", "Bernd Otto", "Erika Sommer", "Ralf Böhm", "Silke Franke", "Jens Albrecht",
  "Heike Winkler", "Marco Brandt", "Tanja Kühn", "Rüdiger Engel", "Nicole Peters", "Anna Beispiel",
];

/** Diese zahlen an den vergangenen Abenden nie – ihr Deckel wächst (einer über die Warngrenze). */
const ALWAYS_OPEN = new Set(["Heinz Zimmermann", "Klaus Becker"]);

/** Anfangsbestand in Stück. Chips bleiben leer („Nachkaufen“), Fischbrötchen werden knapp. */
const OPENING_STOCK: Record<string, number> = {
  "Pils 0,33": 144, "Radler 0,33": 48, "Weizen 0,5": 40, "Alkoholfreies Bier": 24, Cola: 48, Limo: 24,
  Wasser: 36, Kaffee: 120, Korn: 70, Bratwurst: 40, Currywurst: 30, "Fischbrötchen": 8,
};

/** Was an der Theke bestellt wird – häufige Artikel stehen öfter drin. */
const ORDERS = [
  "Pils 0,33", "Pils 0,33", "Pils 0,33", "Pils 0,33", "Pils 0,33", "Radler 0,33", "Radler 0,33", "Weizen 0,5",
  "Weizen 0,5", "Cola", "Cola", "Korn", "Korn", "Wasser", "Alkoholfreies Bier", "Limo", "Kaffee", "Bratwurst",
  "Currywurst",
];

const EVENINGS = [
  { daysAgo: 6, title: "Skatabend", guests: 12 },
  { daysAgo: 3, title: "Heimspiel gegen SV Nachbardorf", guests: 18 },
  { daysAgo: 1, title: null, guests: 9 },
];

/** Gleiche Daten bei jedem Start (einfacher Zufallsgenerator mit festem Startwert). */
function random(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 24 * 60 * 60_000;

/** Zeitpunkt „Tag X um hh:mm“ in deutscher Zeit (inkl. Sommer-/Winterzeit). */
function berlinTime(day: string, hour: number, minute: number): Date {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(guess));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const shown = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (shown - guess));
}

/** Ein Tag als „JJJJ-MM-TT“, `days` Tage vor dem Geschäftstag von `now`. */
function dayBefore(now: Date, days: number): string {
  const [y, m, d] = businessDate(now, CUTOFF_HOUR).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Legt die Beispieldaten an – nur in einer frischen Datenbank (noch kein Admin-Konto).
 * Liefert false, wenn schon etwas da war.
 */
export async function seedDemoData(db: Db, randomToken: () => string, now = new Date()): Promise<boolean> {
  const [{ n }] = await db.select({ n: count() }).from(authUser);
  if (n > 0) return false;
  const rnd = random(1904);
  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)];
  const shuffle = <T>(list: T[]) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  // Artikel mit Anfangsbestand und Wechselgeld in der Handkasse (vor zwei Wochen)
  const articles = await insertStarterArticles(db);
  const byName = new Map(articles.map((a) => [a.name, a]));
  const startDay = dayBefore(now, 14);
  const [opening] = await db
    .insert(purchase)
    .values({ purchasedOn: startDay, source: "opening", note: "Anfangsbestand" })
    .returning({ id: purchase.id });
  await db.insert(purchaseLine).values(
    Object.entries(OPENING_STOCK).map(([name, quantity]) => {
      const a = byName.get(name)!;
      return { purchaseId: opening.id, articleId: a.id, description: name, quantity, totalCents: quantity * Math.round(a.priceCents / 2) };
    }),
  );
  await db.insert(cashMovement).values({
    potId: "cash",
    type: "deposit",
    amountCents: 10_000,
    note: "Wechselgeld für die Handkasse",
    createdAt: berlinTime(startDay, 18, 0),
  });

  // Mitglieder mit persönlichem Link
  const members = await db
    .insert(member)
    .values(MEMBERS.map((name) => ({ name, createdAt: berlinTime(startDay, 17, 0) })))
    .returning({ id: member.id, name: member.name });
  await db.insert(memberToken).values(members.map((m) => ({ memberId: m.id, token: randomToken() })));

  // Abende: Runden an der Theke, am Ende zahlen die meisten (bar oder PayPal)
  const open = new Map<string, number>();
  const book = async (op: ThekeOp, at: Date) => {
    const [result] = await applyOps(db, [op], { deviceId: "demo", cutoffHour: CUTOFF_HOUR, now: new Date(at.getTime() + 60_000) });
    if (result.status !== "ok") throw new Error(`Beispieldaten: ${result.message ?? result.status}`);
  };
  const sale = async (m: { id: string; name: string }, at: Date, items: string[]) => {
    const lines = new Map<string, number>();
    for (const name of items) lines.set(name, (lines.get(name) ?? 0) + 1);
    const op: SaleOp = {
      type: "sale",
      id: randomUUID(),
      memberId: m.id,
      createdAt: at.toISOString(),
      lines: [...lines].map(([name, quantity]) => {
        const a = byName.get(name)!;
        return { id: randomUUID(), articleId: a.id, articleName: name, quantity, unitPriceCents: a.priceCents, isGuest: false };
      }),
    };
    await book(op, at);
    const total = op.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);
    open.set(m.id, (open.get(m.id) ?? 0) + total);
    return op.id;
  };
  const pay = async (m: { id: string }, at: Date, method: "cash" | "paypal", saleId: string | null = null) => {
    const amountCents = open.get(m.id) ?? 0;
    if (amountCents === 0) return;
    // Bar wird oft aufgerundet – der Rest ist Trinkgeld
    const tipCents = method === "cash" && rnd() < 0.5 ? Math.ceil(amountCents / 100) * 100 - amountCents : 0;
    const cashGivenCents = method === "cash" ? Math.ceil((amountCents + tipCents) / 1000) * 1000 : null;
    await book({ type: "payment", id: randomUUID(), memberId: m.id, createdAt: at.toISOString(), methodId: method, amountCents, tipCents, cashGivenCents, saleId }, at);
    open.set(m.id, 0);
  };

  for (const evening of EVENINGS) {
    const day = dayBefore(now, evening.daysAgo);
    const regulars = members.filter((m) => ALWAYS_OPEN.has(m.name));
    const others = shuffle(members.filter((m) => !ALWAYS_OPEN.has(m.name)));
    const guests = [...regulars, ...others.slice(0, evening.guests - regulars.length)];
    for (const m of guests) {
      const rounds = ALWAYS_OPEN.has(m.name) ? 3 : 1 + Math.floor(rnd() * 3);
      for (let r = 0; r < rounds; r++) {
        const minute = 19 * 60 + Math.floor(rnd() * 210);
        await sale(m, berlinTime(day, Math.floor(minute / 60), minute % 60), Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => pick(ORDERS)));
      }
    }
    for (const m of guests) {
      if (ALWAYS_OPEN.has(m.name) || rnd() < 0.15) continue;
      await pay(m, berlinTime(day, 22, 45 + Math.floor(rnd() * 14)), rnd() < 0.25 ? "paypal" : "cash");
    }
    if (evening.title) await db.update(event).set({ title: evening.title }).where(eq(event.businessDate, day));
  }

  // Heute: Runden der letzten anderthalb Stunden, Deckel noch offen – einer zahlt gleich
  const today = members.filter((m) => !ALWAYS_OPEN.has(m.name)).slice(0, 7);
  for (const [i, m] of [members[0], ...today].entries()) {
    const at = new Date(now.getTime() - (90 - i * 10) * 60_000);
    const saleId = await sale(m, at, i === 3 ? ["Kaffee"] : [pick(ORDERS), pick(ORDERS)]);
    if (i === 3) await pay(m, new Date(at.getTime() + 60_000), "cash", saleId);
  }

  // Tagesgericht (per Handy bestellbar), Tipp des Hauses, Küche offen
  const [soup] = await db
    .insert(article)
    .values({
      name: "Kartoffelsuppe",
      categoryId: "essen",
      icon: "soup",
      priceCents: 400,
      description: "Mit Würstchen, dazu Brot",
      trackStock: false,
      dailySpecial: true,
      offeredOn: businessDate(now, CUTOFF_HOUR),
      orderable: true,
      sortOrder: articles.length + 1,
    })
    .returning({ id: article.id });
  await db
    .update(settings)
    .set({
      clubName: "TSV Musterstadt",
      pinHash: hashPin(DEMO_LOGIN.pin),
      kitchenOpen: true,
      tipArticleId: byName.get("Korn")!.id,
      tipText: "Der Klare zum Feierabend",
      privacyController: "TSV Musterstadt e. V., vertreten durch den Vorstand",
      privacyAddress: "Sportplatzweg 1, 12345 Musterstadt",
      privacyEmail: "vorstand@example.org",
      setupDoneAt: now,
      updatedAt: now,
    })
    .where(eq(settings.id, 1));
  const ordered = await createFoodOrder(
    db,
    members.find((m) => m.name === "Petra Schulz")!.id,
    { lines: [{ articleId: soup.id, quantity: 1 }], note: "ohne Würstchen" },
    now,
  );
  if (!ordered.ok) throw new Error(`Beispieldaten: ${ordered.message}`);

  // Zuletzt das Admin-Konto: Erst damit gilt die Demo als eingerichtet.
  const userId = randomUUID();
  await db.insert(authUser).values({ id: userId, name: DEMO_LOGIN.name, email: DEMO_LOGIN.email, emailVerified: true });
  await db.insert(authAccount).values({
    id: randomUUID(),
    accountId: userId,
    providerId: "credential",
    userId,
    password: await hashPassword(DEMO_LOGIN.password),
  });
  return true;
}
