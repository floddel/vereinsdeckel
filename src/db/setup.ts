import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import { migrate as migrateNodePg } from "drizzle-orm/node-postgres/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { Pool } from "pg";
import type { Db } from "./client";
import * as schema from "./schema";
import { article, category, member, memberToken, paymentMethod, pot, purchase, purchaseLine, settings } from "./schema";

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "src/db/migrations");

/** Beliebige feste Zahl: Sperre „Migrationen laufen“ (nur PostgreSQL). */
const MIGRATION_LOCK = 724_031;

/** Spielt alle noch fehlenden Migrationen ein. */
export async function migrateDb(db: Db): Promise<void> {
  const client = (db as unknown as { $client: unknown }).$client;
  if (client instanceof PGlite) {
    await migratePglite(db as unknown as PgliteDatabase<typeof schema>, { migrationsFolder: MIGRATIONS_FOLDER });
    return;
  }
  if (!(client instanceof Pool)) throw new Error("Unbekannte Datenbank-Verbindung");
  // Starten mehrere Server gleichzeitig (z. B. bei Vercel), spielt nur einer die Migrationen ein;
  // die anderen warten an der Sperre und finden danach nichts mehr zu tun.
  const conn = await client.connect();
  try {
    await conn.query("select pg_advisory_lock($1)", [MIGRATION_LOCK]);
    try {
      await migrateNodePg(drizzleNodePg({ client: conn, schema, casing: "snake_case" }), { migrationsFolder: MIGRATIONS_FOLDER });
    } finally {
      await conn.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK]);
    }
  } finally {
    conn.release();
  }
}

/** Grunddaten, ohne die die App nicht funktioniert. Mehrfaches Ausführen schadet nicht. */
export async function seedBaseData(db: Db): Promise<void> {
  await db.insert(settings).values({ id: 1 }).onConflictDoNothing();
  await db
    .insert(category)
    .values([
      { id: "getraenke", name: "Getränke", sortOrder: 1 },
      { id: "essen", name: "Essen", sortOrder: 2 },
      { id: "sonstiges", name: "Sonstiges", sortOrder: 3 },
    ])
    .onConflictDoNothing();
  await db
    .insert(pot)
    .values([
      { id: "cash", name: "Handkasse", sortOrder: 1 },
      { id: "paypal", name: "PayPal", sortOrder: 2 },
    ])
    .onConflictDoNothing();
  await db
    .insert(paymentMethod)
    .values([
      { id: "cash", label: "Bar", potId: "cash", sortOrder: 1 },
      { id: "paypal", label: "PayPal", potId: "paypal", sortOrder: 2 },
    ])
    .onConflictDoNothing();
}

/** Beispielartikel für die Entwicklung (nur wenn noch keine Artikel existieren). */
/** Startvorlage für neue Vereine (Einrichtungsassistent) und Beispielartikel der Entwicklung. */
export const STARTER_ARTICLES: (typeof article.$inferInsert)[] = [
  { name: "Pils 0,33", categoryId: "getraenke", icon: "beer", priceCents: 200, tallyGroup: "Bier" },
  { name: "Radler 0,33", categoryId: "getraenke", icon: "beer", priceCents: 200, tallyGroup: "Bier" },
  { name: "Weizen 0,5", categoryId: "getraenke", icon: "wheat-beer", priceCents: 300, tallyGroup: "Bier" },
  { name: "Alkoholfreies Bier", categoryId: "getraenke", icon: "beer", priceCents: 200 },
  { name: "Cola", categoryId: "getraenke", icon: "soda", priceCents: 150, tallyGroup: "Softdrinks" },
  { name: "Limo", categoryId: "getraenke", icon: "soda", priceCents: 150, tallyGroup: "Softdrinks" },
  { name: "Wasser", categoryId: "getraenke", icon: "water", priceCents: 100 },
  { name: "Kaffee", categoryId: "getraenke", icon: "coffee", priceCents: 100 },
  { name: "Korn", categoryId: "getraenke", icon: "shot", priceCents: 150, tallyGroup: "Schnaps" },
  { name: "Bratwurst", categoryId: "essen", icon: "sausage", priceCents: 300, tallyGroup: "Wurst", orderable: true },
  { name: "Currywurst", categoryId: "essen", icon: "sausage", priceCents: 400, tallyGroup: "Wurst", orderable: true },
  { name: "Fischbrötchen", categoryId: "essen", icon: "fish", priceCents: 350, orderable: true },
  { name: "Chips", categoryId: "sonstiges", icon: "snack", priceCents: 150 },
];

/** Startvorlage einfügen – nur, solange es noch keine Artikel gibt. Liefert die angelegten Artikel. */
export async function insertStarterArticles(db: Db): Promise<{ id: string; name: string; priceCents: number }[]> {
  const existing = await db.select({ id: article.id }).from(article).limit(1);
  if (existing.length > 0) return [];
  return db
    .insert(article)
    .values(STARTER_ARTICLES.map((r, i) => ({ ...r, sortOrder: i + 1 })))
    .returning({ id: article.id, name: article.name, priceCents: article.priceCents });
}

export async function seedExampleArticles(db: Db): Promise<void> {
  const created = await insertStarterArticles(db);
  if (created.length === 0) return;
  // Beispiel-Anfangsbestand, damit an der Theke verkauft werden kann (Chips bleiben leer → „Nachkaufen“)
  const [p] = await db
    .insert(purchase)
    .values({ purchasedOn: "2026-01-01", source: "opening", note: "Beispiel-Anfangsbestand" })
    .returning({ id: purchase.id });
  await db.insert(purchaseLine).values(
    created
      .filter((a) => a.name !== "Chips")
      .map((a) => ({ purchaseId: p.id, articleId: a.id, description: a.name, quantity: 1000, totalCents: 1000 * Math.round(a.priceCents / 2) })),
  );
}

/** Beispielmitglieder für Tests der Theke (nur mit SEED_EXAMPLE_MEMBERS=1 und nur bei leerer Liste). */
export async function seedExampleMembers(db: Db, randomToken: () => string): Promise<void> {
  const existing = await db.select({ id: member.id }).from(member).limit(1);
  if (existing.length > 0) return;
  const first = ["Klaus", "Jürgen", "Peter", "Hans", "Uwe", "Dieter", "Günter", "Werner", "Horst", "Heinz", "Manfred", "Wolfgang"];
  const last = ["Müller", "Schmidt", "Weiß", "Becker", "Ölschläger"];
  const names = first.flatMap((f) => last.map((l) => `${f} ${l}`)).slice(0, 52);
  names.push("Anni Kramer", "Erika Vogt", "Ute Lange", "Zita Ostermann");
  const rows = await db
    .insert(member)
    .values(names.map((name) => ({ name })))
    .returning({ id: member.id });
  await db.insert(memberToken).values(rows.map((r) => ({ memberId: r.id, token: randomToken() })));
}
