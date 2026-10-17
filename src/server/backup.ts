import { readFileSync } from "node:fs";
import path from "node:path";
import { count, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import {
  article,
  cashCount,
  cashMovement,
  category,
  event,
  file,
  inventoryCount,
  inventoryLine,
  member,
  memberToken,
  payment,
  paymentMethod,
  pot,
  purchase,
  purchaseAlias,
  purchaseLine,
  sale,
  saleLine,
  settings,
} from "@/db/schema";
import { MIGRATIONS_FOLDER } from "@/db/setup";
import { isServed } from "@/domain/stock";
import { getStockOverview } from "./stock";

/**
 * Sichern & Umziehen: alle Vereinsdaten als eine JSON-Datei – und zurück in eine frische Installation.
 * Nie enthalten: Login (Passwort, Sitzungen, zweiter Faktor), PIN, KI-Schlüssel (hängt am Server-Geheimnis).
 */
export const BACKUP_FORMAT = "vereinsdeckel-sicherung";
/** Ältere Formatnamen – werden weiter angenommen. */
const LEGACY_FORMATS = ["vereinsheim-sicherung"];
export const BACKUP_VERSION = 1;

/** Tabellen in Einfüge-Reihenfolge (Verweise zeigen immer auf weiter oben). Handy-Bestellungen bleiben weg (30 Tage). */
const TABLES = {
  categories: category,
  pots: pot,
  paymentMethods: paymentMethod,
  articles: article,
  members: member,
  memberTokens: memberToken,
  events: event,
  purchases: purchase,
  purchaseLines: purchaseLine,
  purchaseAliases: purchaseAlias,
  sales: sale,
  saleLines: saleLine,
  payments: payment,
  cashMovements: cashMovement,
  cashCounts: cashCount,
  inventoryCounts: inventoryCount,
  inventoryLines: inventoryLine,
} as const satisfies Record<string, PgTable>;
type TableKey = keyof typeof TABLES;

/** Einstellungen, die mit umziehen (ohne PIN, Sperren, KI-Schlüssel, Einrichtungsstand). */
const SETTINGS_KEYS = [
  "clubName",
  "logoFileId",
  "paypalName",
  "warnLimitCents",
  "businessDayCutoffHour",
  "lowStockEvenings",
  "privacyController",
  "privacyAddress",
  "privacyEmail",
  "privacyAuthority",
  "privacyChecks",
  "hostingKind",
  "accent",
  "hostingName",
  "hostingLocation",
  "hostingContract",
  "tipArticleId",
  "tipText",
  // Testphase beendet: auch nach einem Umzug lässt sich nichts zurücksetzen
  "testPhaseEndedAt",
] as const;

type Row = Record<string, unknown>;

export interface Backup {
  format: string;
  version: number;
  /** Anzahl der Migrationen der App, die die Sicherung geschrieben hat */
  schema: number;
  exportedAt: string;
  clubName: string;
  settings: Row;
  files: { id: string; mimeType: string; base64: string; createdAt: string }[];
  tables: Record<TableKey, Row[]>;
  /** Bestand beim Sichern (für „Stammdaten + aktueller Bestand“) */
  stock: { articleId: string; stock: number; valueCents: number | null }[];
}

export function migrationCount(): number {
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8")) as { entries: unknown[] };
  return journal.entries.length;
}

/** Alles sichern. Belegfotos nur auf Wunsch (können die Datei groß machen). */
export async function exportBackup(db: Db, { receipts = false } = {}): Promise<Backup> {
  const [[s], stock] = await Promise.all([db.select().from(settings).where(eq(settings.id, 1)), getStockOverview(db)]);
  const tables = {} as Record<TableKey, Row[]>;
  for (const [key, table] of Object.entries(TABLES) as [TableKey, PgTable][]) {
    tables[key] = (await db.select().from(table)) as Row[];
  }
  const fileIds = [s.logoFileId, ...(receipts ? tables.purchases.map((p) => p.receiptFileId as string | null) : [])].filter((x): x is string => !!x);
  const files = fileIds.length ? await db.select().from(file).where(inArray(file.id, fileIds)) : [];
  if (!receipts) tables.purchases = tables.purchases.map((p) => ({ ...p, receiptFileId: null }));

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    schema: migrationCount(),
    exportedAt: new Date().toISOString(),
    clubName: s.clubName,
    settings: Object.fromEntries(SETTINGS_KEYS.map((k) => [k, s[k]])),
    files: files.map((f) => ({ id: f.id, mimeType: f.mimeType, base64: Buffer.from(f.bytes).toString("base64"), createdAt: f.createdAt.toISOString() })),
    tables,
    stock: stock.rows.map((r) => ({ articleId: r.articleId, stock: r.stock, valueCents: r.valueCents })),
  };
}

export type ImportMode = "stammdaten" | "alles";

export type ImportResult =
  | { ok: true; articles: number; members: number; bookings: number; stockLines: number }
  | { ok: false; error: string };

/** Ist die Installation noch leer genug zum Übernehmen? (keine Artikel, Mitglieder, Buchungen, Einkäufe) */
export async function isFreshInstallation(db: Db): Promise<boolean> {
  const counts = await Promise.all(
    [article, member, sale, payment, purchase, cashMovement].map((t) =>
      db
        .select({ n: count() })
        .from(t)
        .then(([r]) => r.n),
    ),
  );
  return counts.every((n) => n === 0);
}

/** Prüft Aufbau und Version einer hochgeladenen Sicherung. */
export function parseBackup(text: string): Backup | string {
  let data: Backup;
  try {
    data = JSON.parse(text) as Backup;
  } catch {
    return "Die Datei ist keine Sicherung (kein gültiges JSON).";
  }
  const known = data?.format === BACKUP_FORMAT || LEGACY_FORMATS.includes(data?.format);
  if (!known || typeof data.version !== "number" || !data.tables) return "Die Datei ist keine Sicherung dieser App.";
  if (data.version > BACKUP_VERSION || data.schema > migrationCount()) {
    return "Die Sicherung stammt von einer neueren Version der App – bitte erst diese Installation aktualisieren.";
  }
  return data;
}

/** Werte aus JSON zurückverwandeln (Zeitpunkte als Date), unbekannte Felder weglassen. */
function revive(table: PgTable, row: Row): Row {
  const out: Row = {};
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    if (!(key in row)) continue;
    const v = row[key];
    out[key] = col.columnType === "PgTimestamp" && typeof v === "string" ? new Date(v) : v;
  }
  return out;
}

/** Zeilen mit Verweis auf dieselbe Tabelle (z. B. Storno → Original) nach den Originalen einfügen. */
const SELF_REFS: Partial<Record<TableKey, string>> = {
  articles: "stockArticleId",
  purchases: "reversesPurchaseId",
  sales: "reversesSaleId",
  saleLines: "reversesLineId",
  payments: "reversesPaymentId",
  cashMovements: "reversesMovementId",
};
const originalsFirst = (rows: Row[], ref?: string) => (ref ? [...rows].sort((a, b) => Number(!!a[ref]) - Number(!!b[ref])) : rows);

/**
 * Sicherung in eine frische Installation übernehmen.
 * - „stammdaten“: Einstellungen, Logo, Artikel, Mitglieder samt ihren Links, gelernte Bon-Zuordnungen –
 *   dazu der Bestand beim Sichern als „Anfangsbestand“ mit seinem Einkaufswert. Keine Buchungen.
 * - „alles“: zusätzlich alle Abende, Buchungen, Zahlungen, Einkäufe, Kasse und Inventuren.
 */
export async function importBackup(db: Db, backup: Backup, mode: ImportMode, today: string): Promise<ImportResult> {
  if (!(await isFreshInstallation(db))) {
    return { ok: false, error: "Übernehmen geht nur in eine frische Installation (noch ohne Artikel, Mitglieder und Buchungen)." };
  }
  const keep: TableKey[] =
    mode === "alles"
      ? (Object.keys(TABLES) as TableKey[])
      : ["categories", "pots", "paymentMethods", "articles", "members", "memberTokens", "purchaseAliases"];

  return db.transaction(async (tx): Promise<ImportResult> => {
    const fileIds = new Set<string>();
    for (const f of backup.files ?? []) {
      await tx
        .insert(file)
        .values({ id: f.id, mimeType: f.mimeType, bytes: new Uint8Array(Buffer.from(f.base64, "base64")), createdAt: new Date(f.createdAt) })
        .onConflictDoNothing();
      fileIds.add(f.id);
    }

    for (const key of keep) {
      const table = TABLES[key];
      let rows = (backup.tables[key] ?? []).map((r) => revive(table, r));
      if (rows.length === 0) continue;
      if (key === "memberTokens" && mode === "stammdaten") rows = rows.filter((r) => !r.revokedAt);
      if (key === "articles") rows = rows.map((r) => ({ ...r, offeredOn: null }));
      if (key === "purchases") rows = rows.map((r) => ({ ...r, receiptFileId: r.receiptFileId && fileIds.has(r.receiptFileId as string) ? r.receiptFileId : null }));
      rows = originalsFirst(rows, SELF_REFS[key]);
      // Grunddaten (Kategorien, Töpfe, Zahlungsarten) gibt es schon – mit den gesicherten Namen überschreiben
      const base = key === "categories" || key === "pots" || key === "paymentMethods";
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        if (base) {
          for (const r of chunk) {
            const rest = Object.fromEntries(Object.entries(r).filter(([k]) => k !== "id"));
            await tx
              .insert(table as PgTable)
              .values(r as never)
              .onConflictDoUpdate({ target: getTableColumns(table).id, set: rest as never });
          }
        } else {
          await tx.insert(table as PgTable).values(chunk as never);
        }
      }
    }

    // Einstellungen (Logo nur, wenn es mitkam; Tipp nur, wenn der Artikel da ist)
    const st = revive(settings, backup.settings ?? {});
    if (st.logoFileId && !fileIds.has(st.logoFileId as string)) st.logoFileId = null;
    const articleIds = new Set((backup.tables.articles ?? []).map((a) => a.id as string));
    if (st.tipArticleId && !articleIds.has(st.tipArticleId as string)) st.tipArticleId = null;
    await tx
      .update(settings)
      .set({ ...st, updatedAt: new Date() })
      .where(eq(settings.id, 1));

    // Stammdaten: Bestand beim Sichern als Anfangsbestand (mit Einkaufswert), damit Bestand und Warenwert weiterstimmen
    let stockLines = 0;
    if (mode === "stammdaten") {
      const byId = new Map((backup.tables.articles ?? []).map((a) => [a.id as string, a]));
      const lines = (backup.stock ?? [])
        .filter((s) => s.stock > 0 && byId.has(s.articleId))
        .map((s) => {
          const a = byId.get(s.articleId)!;
          const unit = { servingMl: (a.servingMl as number | null) ?? null, bottleMl: (a.bottleMl as number | null) ?? null, packSize: null };
          // Ausschank: Bestand in ml – als ganze Flaschen, sonst als ml (Flaschengröße 1)
          const served = isServed(unit);
          const bottle = served ? (unit.bottleMl && s.stock % unit.bottleMl === 0 ? unit.bottleMl : 1) : null;
          return {
            articleId: s.articleId,
            description: a.name as string,
            quantity: served ? s.stock / bottle! : s.stock,
            bottleMl: bottle,
            totalCents: s.valueCents === null ? null : Math.max(Math.round(s.valueCents), 0),
          };
        });
      if (lines.length > 0) {
        const [p] = await tx
          .insert(purchase)
          .values({ purchasedOn: today, source: "opening", note: `Anfangsbestand aus der Sicherung vom ${backup.exportedAt.slice(0, 10)}` })
          .returning({ id: purchase.id });
        await tx.insert(purchaseLine).values(lines.map((l) => ({ ...l, purchaseId: p.id })));
        stockLines = lines.length;
      }
    }

    const [[a], [m]] = await Promise.all([
      tx.select({ n: count() }).from(article),
      tx.select({ n: count() }).from(member).where(isNull(member.anonymizedAt)),
    ]);
    const bookings = mode === "alles" ? (backup.tables.sales?.length ?? 0) + (backup.tables.payments?.length ?? 0) : 0;
    return { ok: true, articles: a.n, members: m.n, bookings, stockLines };
  });
}

export const backupFileName = (b: Pick<Backup, "exportedAt">) => `vereinsdeckel-sicherung-${b.exportedAt.slice(0, 10)}.json`;
