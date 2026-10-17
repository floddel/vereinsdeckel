/**
 * Datenbank-Schema.
 *
 * Regeln:
 * - Geldbeträge immer als ganze Cent (`integer`, Spaltenname endet auf `_cents`).
 * - Bewegungsdaten (Verkäufe, Zahlungen, Einkäufe, Kassenbewegungen, Zählungen, Inventuren) sind
 *   append-only: Ein Datenbank-Trigger verbietet UPDATE und DELETE (Migration `append_only`).
 *   Korrekturen nur durch Stornos, also neue Zeilen.
 * - Salden werden nie gespeichert, sondern immer aus den Einzelzeilen berechnet.
 * - Spaltennamen in der Datenbank: snake_case (automatisch aus camelCase).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export * from "./auth-schema";

const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType: () => "bytea",
});

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------------------
// Stammdaten (änderbar)
// ---------------------------------------------------------------------------

/** Dateien (Vereinslogo, Belegfotos), im Browser verkleinert. */
export const file = pgTable("file", {
  id: uuid().primaryKey().defaultRandom(),
  mimeType: text().notNull(),
  bytes: bytea().notNull(),
  createdAt: createdAt(),
});

/** Einstellungen: genau eine Zeile mit id = 1. */
export const settings = pgTable(
  "settings",
  {
    id: integer().primaryKey().default(1),
    clubName: text().notNull().default("Mein Verein"),
    logoFileId: uuid().references(() => file.id),
    paypalName: text(),
    warnLimitCents: integer().notNull().default(3000),
    pinHash: text(),
    /** Fehlversuche bei der PIN-Eingabe und Sperre (Schutz gegen Durchprobieren). */
    pinFailedAttempts: integer().notNull().default(0),
    pinLockedUntil: timestamp({ withTimezone: true }),
    /** Dasselbe für die Anmeldung mit Passwort (es gibt nur ein Admin-Konto). */
    loginFailedAttempts: integer().notNull().default(0),
    loginLockedUntil: timestamp({ withTimezone: true }),
    businessDayCutoffHour: integer().notNull().default(6),
    lowStockEvenings: integer().notNull().default(2),
    /** „Küche offen“: nur dann können Mitglieder per Handy Essen bestellen. */
    kitchenOpen: boolean().notNull().default(false),
    /** Kassenbon-Erkennung per KI (Anthropic) – nur wenn eingeschaltet. */
    aiReceiptsEnabled: boolean().notNull().default(false),
    /** API-Schlüssel für Anthropic, verschlüsselt (lib/secret-box). Leer = Umgebungsvariable oder keiner. */
    anthropicKeyEnc: text(),
    /** Datenschutzhinweis: wer verantwortlich ist (Person oder Verein), Anschrift, E-Mail, Aufsichtsbehörde. */
    privacyController: text(),
    privacyAddress: text(),
    privacyEmail: text(),
    privacyAuthority: text(),
    /** „Tipp des Hauses“ auf der Karte (z. B. gegen Ladenhüter) mit einem kurzen Spruch. */
    tipArticleId: uuid().references((): AnyPgColumn => article.id, { onDelete: "set null" }),
    tipText: text(),
    /** Wo die App läuft (für Datenschutzhinweis und Checkliste): vercel-neon | own | provider */
    hostingKind: text().notNull().default("vercel-neon"),
    /** Vereinsfarbe der App (siehe lib/accent): blau | petrol | gruen | gold | rot | lila | graphit | eigen-<Farbton>-<Kräftigkeit> */
    accent: text().notNull().default("blau"),
    /** Nur bei „provider“: Name, Standort und Vertrag (AVV) des Anbieters */
    hostingName: text(),
    hostingLocation: text(),
    hostingContract: text(),
    /** Einrichtungsassistent abgeschlossen (bis dahin zeigt die Übersicht „Einrichtung fortsetzen“) */
    setupDoneAt: timestamp({ withTimezone: true }),
    /**
     * Testphase beendet: ab dann lassen sich keine Daten mehr zurücksetzen – endgültig
     * (die Datenbank verhindert, dass der Wert wieder gelöscht wird, siehe Migration 0018).
     */
    testPhaseEndedAt: timestamp({ withTimezone: true }),
    /** Zuletzt zurückgesetzt: ältere, noch nicht gesendete Buchungen der Theke werden danach verworfen */
    dataResetAt: timestamp({ withTimezone: true }),
    /** Checkliste des Betreibers, z. B. { "avv-hosting": true } */
    privacyChecks: jsonb().$type<Record<string, boolean>>().notNull().default({}),
    updatedAt: createdAt(),
  },
  (t) => [
    check("settings_single_row", sql`${t.id} = 1`),
    check("settings_warn_limit", sql`${t.warnLimitCents} >= 0`),
    check("settings_cutoff", sql`${t.businessDayCutoffHour} between 0 and 12`),
  ],
);

/** Kategorien der Artikelkacheln (Getränke, Essen, Sonstiges). */
export const category = pgTable("category", {
  id: text().primaryKey(),
  name: text().notNull(),
  sortOrder: integer().notNull().default(0),
});

export const article = pgTable(
  "article",
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    categoryId: text()
      .notNull()
      .references(() => category.id),
    /** Schlüssel eines lokalen Symbols, z. B. "beer", "soda", "sausage". */
    icon: text().notNull().default("other"),
    /** Aktueller Vereinspreis. Buchungen speichern ihren eigenen Preis. */
    priceCents: integer().notNull(),
    /** Strich-Gruppe auf dem Bierdeckel (z. B. "Bier" für Pils und Radler). Leer = Artikelname. */
    tallyGroup: text(),
    /** Bestand führen? (nein z. B. bei Spenden oder Pfand) */
    trackStock: boolean().notNull().default(true),
    /**
     * Ausschank: Portion in ml (z. B. 40 = 4 cl Schnaps, 200 = Glas Cola). Leer = Stückartikel (Flasche, Wurst).
     * Der Bestand von Ausschank-Artikeln wird in ml geführt.
     */
    servingMl: integer(),
    /** Ausschank: übliche Flaschengröße in ml (für Einkauf, Inventur und „≈ x Flaschen“). */
    bottleMl: integer(),
    /** Stückartikel: Stück je Kiste/Gebinde (z. B. 20), für Einkauf und Inventur. */
    packSize: integer(),
    /**
     * Ausschank aus dem Bestand eines anderen Artikels (z. B. „Le Filou Flasche 1 l“ aus „Le Filou Glas“).
     * Dann hat der Artikel keinen eigenen Bestand; Verkäufe mindern den anderen Artikel.
     */
    stockArticleId: uuid().references((): AnyPgColumn => article.id),
    /** Notiz nur für die Verwaltung, z. B. welche Marken zu „Schnaps Marke“ gehören. */
    note: text(),
    /** Beschreibung für Gäste auf der Karte (öffentlich), z. B. „fruchtig, halbtrocken“. */
    description: text(),
    /**
     * Selbst gekocht („Heute frisch gekocht“): nur an dem Abend sichtbar und verkaufbar, für den es
     * eingeschaltet wurde (offeredOn = Geschäftstag). Am nächsten Tag verschwindet es von selbst.
     */
    dailySpecial: boolean().notNull().default(false),
    offeredOn: date({ mode: "string" }),
    /** Per Handy bestellbar (nur bei Essen wirksam). */
    orderable: boolean().notNull().default(false),
    /**
     * Gibt es gerade (Schalter in der Artikelliste, z. B. vor einer Veranstaltung): ausgeschaltet nicht
     * an der Theke, auf der Karte und beim Bestellen. Bestand, Inventur und Einkauf bleiben – anders als bei „aktiv“.
     */
    available: boolean().notNull().default(true),
    /** Inaktiv = ausgemustert: erscheint nirgends mehr, auch nicht in Bestand und Einkauf. */
    active: boolean().notNull().default(true),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    check("article_price", sql`${t.priceCents} >= 0`),
    check("article_serving", sql`${t.servingMl} is null or ${t.servingMl} between 1 and 5000`),
    check("article_bottle", sql`${t.bottleMl} is null or ${t.bottleMl} between 1 and 50000`),
    check("article_pack", sql`${t.packSize} is null or ${t.packSize} between 2 and 1000`),
    check("article_stock_other", sql`${t.stockArticleId} is null or ${t.stockArticleId} <> ${t.id}`),
  ],
);

export const member = pgTable(
  "member",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Anzeigename an der Theke, z. B. „Klaus Müller“ oder „Klaus M. (sen.)“. Einziges Pflichtfeld (Datensparsamkeit). */
    name: text().notNull(),
    active: boolean().notNull().default(true),
    createdAt: createdAt(),
    /** Gesetzt, wenn das Mitglied anonymisiert wurde (DSGVO). Buchungen bleiben für die Kasse. */
    anonymizedAt: timestamp({ withTimezone: true }),
  },
  // Namen müssen an der Theke eindeutig sein (Groß-/Kleinschreibung egal).
  (t) => [uniqueIndex("member_name_unique").on(sql`lower(${t.name})`)],
);

/** Persönlicher Link eines Mitglieds. Pro Mitglied höchstens ein aktiver Token. */
export const memberToken = pgTable(
  "member_token",
  {
    id: uuid().primaryKey().defaultRandom(),
    memberId: uuid()
      .notNull()
      .references(() => member.id),
    token: text().notNull(),
    createdAt: createdAt(),
    revokedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex("member_token_token_unique").on(t.token),
    uniqueIndex("member_token_one_active")
      .on(t.memberId)
      .where(sql`${t.revokedAt} is null`),
    check("member_token_length", sql`length(${t.token}) >= 32`),
  ],
);

/** Abend = Geschäftstag (Tageswechsel um `settings.businessDayCutoffHour`). */
export const event = pgTable("event", {
  id: uuid().primaryKey().defaultRandom(),
  businessDate: date({ mode: "string" }).notNull().unique(),
  title: text(),
  note: text(),
  createdAt: createdAt(),
});

/** Geldtöpfe: "cash" (Handkasse), "paypal". */
export const pot = pgTable("pot", {
  id: text().primaryKey(),
  name: text().notNull(),
  sortOrder: integer().notNull().default(0),
});

/** Zahlungsarten, erweiterbar (z. B. später "paypal_api"). Jede fließt in einen Topf. */
export const paymentMethod = pgTable("payment_method", {
  id: text().primaryKey(),
  label: text().notNull(),
  potId: text()
    .notNull()
    .references(() => pot.id),
  active: boolean().notNull().default(true),
  sortOrder: integer().notNull().default(0),
});

// ---------------------------------------------------------------------------
// Bewegungsdaten (append-only)
// ---------------------------------------------------------------------------

/** Ein Bon: Warenkorb an der Theke ("sale") oder Storno ("reversal"). ID kommt vom Gerät. */
export const sale = pgTable(
  "sale",
  {
    id: uuid().primaryKey(),
    memberId: uuid()
      .notNull()
      .references(() => member.id),
    eventId: uuid()
      .notNull()
      .references(() => event.id),
    kind: text({ enum: ["sale", "reversal"] }).notNull(),
    reversesSaleId: uuid().references((): AnyPgColumn => sale.id),
    reason: text(),
    /** Storno durch „Umbuchen auf …“: auf wen (für das Anonymisieren, der Grund nennt nur den Namen). */
    movedToMemberId: uuid().references((): AnyPgColumn => member.id),
    /** Zeitpunkt auf dem Gerät (zählt fachlich, auch offline). */
    createdAt: timestamp({ withTimezone: true }).notNull(),
    /** Zeitpunkt, zu dem der Server den Vorgang erhalten hat. */
    receivedAt: createdAt(),
    deviceId: text(),
  },
  (t) => [
    check("sale_kind", sql`${t.kind} in ('sale', 'reversal')`),
    check(
      "sale_reversal_reason",
      sql`${t.kind} = 'sale' or (${t.reason} is not null and length(trim(${t.reason})) > 0)`,
    ),
    index("sale_member_idx").on(t.memberId, t.createdAt),
    index("sale_event_idx").on(t.eventId),
  ],
);

/** Position eines Bons. Bei Storno: negative Menge mit Verweis auf die Originalposition. */
export const saleLine = pgTable(
  "sale_line",
  {
    id: uuid().primaryKey(),
    saleId: uuid()
      .notNull()
      .references(() => sale.id),
    articleId: uuid()
      .notNull()
      .references(() => article.id),
    /** Name zum Buchungszeitpunkt (Artikel kann später umbenannt werden). */
    articleName: text().notNull(),
    quantity: integer().notNull(),
    /** Preis zum Buchungszeitpunkt. */
    unitPriceCents: integer().notNull(),
    totalCents: integer().notNull(),
    isGuest: boolean().notNull().default(false),
    reversesLineId: uuid().references((): AnyPgColumn => saleLine.id),
  },
  (t) => [
    check("sale_line_quantity", sql`${t.quantity} <> 0`),
    check("sale_line_price", sql`${t.unitPriceCents} >= 0`),
    check("sale_line_total", sql`${t.totalCents} = ${t.quantity} * ${t.unitPriceCents}`),
    check(
      "sale_line_reversal_sign",
      sql`(${t.quantity} > 0) = (${t.reversesLineId} is null)`,
    ),
    index("sale_line_sale_idx").on(t.saleId),
    index("sale_line_reverses_idx").on(t.reversesLineId),
  ],
);

/**
 * Zahlung eines Mitglieds. `amountCents` mindert den offenen Betrag, `tipCents` ist Trinkgeld.
 * Beides fließt in den Topf der Zahlungsart. Storno: negative Beträge + Verweis + Begründung.
 */
export const payment = pgTable(
  "payment",
  {
    id: uuid().primaryKey(),
    memberId: uuid()
      .notNull()
      .references(() => member.id),
    eventId: uuid()
      .notNull()
      .references(() => event.id),
    methodId: text()
      .notNull()
      .references(() => paymentMethod.id),
    amountCents: integer().notNull(),
    tipCents: integer().notNull().default(0),
    /** Nur für den Beleg: wie viel Bargeld gegeben wurde. */
    cashGivenCents: integer(),
    reversesPaymentId: uuid().references((): AnyPgColumn => payment.id),
    reason: text(),
    /** Gesetzt bei "Sofort bezahlen" (Zahlung gehört zu diesem Bon). */
    saleId: uuid().references(() => sale.id),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    receivedAt: createdAt(),
    deviceId: text(),
  },
  (t) => [
    check(
      "payment_sign",
      sql`case when ${t.reversesPaymentId} is null
        then ${t.amountCents} >= 0 and ${t.tipCents} >= 0 and ${t.amountCents} + ${t.tipCents} > 0
        else ${t.amountCents} <= 0 and ${t.tipCents} <= 0 and ${t.amountCents} + ${t.tipCents} < 0
          and ${t.reason} is not null and length(trim(${t.reason})) > 0
      end`,
    ),
    index("payment_member_idx").on(t.memberId, t.createdAt),
    index("payment_event_idx").on(t.eventId),
  ],
);

/** Einkauf (ein Kassenbon vom Händler). Quelle: Handkasse, PayPal oder privat vorgestreckt. */
export const purchase = pgTable(
  "purchase",
  {
    id: uuid().primaryKey().defaultRandom(),
    purchasedOn: date({ mode: "string" }).notNull(),
    source: text({ enum: ["cash", "paypal", "private", "opening"] }).notNull(),
    receiptFileId: uuid().references(() => file.id),
    note: text(),
    reversesPurchaseId: uuid().references((): AnyPgColumn => purchase.id),
    reason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    check("purchase_source", sql`${t.source} in ('cash', 'paypal', 'private', 'opening')`),
    check(
      "purchase_reversal_reason",
      sql`${t.reversesPurchaseId} is null or (${t.reason} is not null and length(trim(${t.reason})) > 0)`,
    ),
  ],
);

/** Position eines Einkaufs. Einkaufspreis pro Einheit = totalCents / quantity (nur berechnet). */
export const purchaseLine = pgTable(
  "purchase_line",
  {
    id: uuid().primaryKey().defaultRandom(),
    purchaseId: uuid()
      .notNull()
      .references(() => purchase.id),
    /** Leer bei Dingen ohne Artikel (z. B. Servietten). */
    articleId: uuid().references(() => article.id),
    description: text().notNull(),
    /** Stück bzw. bei Ausschank-Artikeln: Anzahl Flaschen */
    quantity: integer().notNull(),
    /** Ausschank-Artikel: Größe je Flasche in ml (Bestand = quantity × bottleMl) */
    bottleMl: integer(),
    /** Preis der Position; leer = nicht einzeln bekannt (Geld steckt dann in der Zeile „Rest laut Bon“) */
    totalCents: integer(),
  },
  (t) => [
    check("purchase_line_quantity", sql`${t.quantity} <> 0`),
    check(
      "purchase_line_sign",
      sql`(${t.quantity} > 0 and ${t.totalCents} >= 0) or (${t.quantity} < 0 and ${t.totalCents} <= 0)`,
    ),
    check("purchase_line_bottle", sql`${t.bottleMl} is null or ${t.bottleMl} between 1 and 50000`),
  ],
);

export const cashMovementTypes = [
  "deposit", // Einlage
  "handover", // Abgabe an den Verein
  "transfer", // Umbuchung zwischen den Töpfen (zwei Zeilen, gleiche transferGroupId)
  "paypal_fee", // PayPal-Gebühr
  "other_expense", // sonstige Ausgabe
  "reimbursement", // Erstattung privat vorgestreckter Einkäufe
  "count_correction", // Übernahme einer Kassendifferenz
  "reversal", // Storno einer Kassenbewegung
] as const;
export type CashMovementType = (typeof cashMovementTypes)[number];

/** Kassenbewegung: + Eingang, − Ausgang. Zahlungen und Einkäufe stehen in eigenen Tabellen. */
export const cashMovement = pgTable(
  "cash_movement",
  {
    id: uuid().primaryKey().defaultRandom(),
    potId: text()
      .notNull()
      .references(() => pot.id),
    type: text({ enum: cashMovementTypes }).notNull(),
    amountCents: integer().notNull(),
    transferGroupId: uuid(),
    note: text().notNull(),
    reversesMovementId: uuid().references((): AnyPgColumn => cashMovement.id),
    createdAt: createdAt(),
  },
  (t) => [
    check("cash_movement_amount", sql`${t.amountCents} <> 0`),
    check("cash_movement_note", sql`length(trim(${t.note})) > 0`),
    check(
      "cash_movement_type",
      sql.raw(`type in (${cashMovementTypes.map((v) => `'${v}'`).join(", ")})`),
    ),
    check(
      "cash_movement_reversal",
      sql`(${t.type} = 'reversal') = (${t.reversesMovementId} is not null)`,
    ),
    check(
      "cash_movement_transfer",
      sql`(${t.type} = 'transfer') = (${t.transferGroupId} is not null)`,
    ),
  ],
);

/** Kassenzählung: gezählter Bestand gegen Soll. Differenz wird protokolliert. */
export const cashCount = pgTable(
  "cash_count",
  {
    id: uuid().primaryKey().defaultRandom(),
    potId: text()
      .notNull()
      .references(() => pot.id),
    countedCents: integer().notNull(),
    expectedCents: integer().notNull(),
    differenceCents: integer().notNull(),
    /** Gesetzt, wenn die Differenz als Korrekturbewegung übernommen wurde. */
    correctionMovementId: uuid().references(() => cashMovement.id),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "cash_count_difference",
      sql`${t.differenceCents} = ${t.countedCents} - ${t.expectedCents}`,
    ),
  ],
);

/** Inventur: gezählter Warenbestand. Setzt den berechneten Bestand neu auf. */
export const inventoryCount = pgTable("inventory_count", {
  id: uuid().primaryKey().defaultRandom(),
  countedAt: timestamp({ withTimezone: true }).notNull(),
  note: text(),
  createdAt: createdAt(),
});

export const inventoryLine = pgTable(
  "inventory_line",
  {
    id: uuid().primaryKey().defaultRandom(),
    inventoryCountId: uuid()
      .notNull()
      .references(() => inventoryCount.id),
    articleId: uuid()
      .notNull()
      .references(() => article.id),
    countedQty: integer().notNull(),
    expectedQty: integer().notNull(),
    differenceQty: integer().notNull(),
    /** Mengen in ml (Ausschank-Artikel) statt Stück */
    inMl: boolean().notNull().default(false),
  },
  (t) => [
    check(
      "inventory_line_difference",
      sql`${t.differenceQty} = ${t.countedQty} - ${t.expectedQty}`,
    ),
    uniqueIndex("inventory_line_unique").on(t.inventoryCountId, t.articleId),
  ],
);

// ---------------------------------------------------------------------------
// Handy-Bestellungen (änderbar – keine Buchung! Gebucht wird erst beim Abholen.)
// ---------------------------------------------------------------------------

export const foodOrderStatuses = [
  "new", // eingegangen
  "accepted", // wird zubereitet
  "ready", // fertig, bitte abholen
  "picked_up", // abgeholt (gebucht)
  "rejected", // von der Theke abgelehnt
  "cancelled", // vom Mitglied zurückgezogen
] as const;

/** Essensbestellung eines Mitglieds per Handy. Wird nach 30 Tagen gelöscht (die Buchung bleibt). */
export const foodOrder = pgTable(
  "food_order",
  {
    id: uuid().primaryKey().defaultRandom(),
    memberId: uuid()
      .notNull()
      .references(() => member.id),
    eventId: uuid()
      .notNull()
      .references(() => event.id),
    status: text({ enum: foodOrderStatuses }).notNull().default("new"),
    /** z. B. „mit Senf“ */
    note: text(),
    rejectReason: text(),
    /** Die Buchung, die beim Abholen entsteht. */
    saleId: uuid().references(() => sale.id),
    /** Wann die Theke die Bestellung zum ersten Mal angezeigt hat (sonst: „noch nicht angekommen“). */
    seenAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    check(
      "food_order_status",
      sql.raw(`status in (${foodOrderStatuses.map((v) => `'${v}'`).join(", ")})`),
    ),
    check("food_order_note", sql`${t.note} is null or length(${t.note}) <= 200`),
    check("food_order_picked_up", sql`(${t.status} = 'picked_up') = (${t.saleId} is not null)`),
    check(
      "food_order_rejected",
      sql`${t.status} <> 'rejected' or (${t.rejectReason} is not null and length(trim(${t.rejectReason})) > 0)`,
    ),
    uniqueIndex("food_order_sale_unique").on(t.saleId),
    index("food_order_event_idx").on(t.eventId, t.status),
    index("food_order_member_idx").on(t.memberId, t.createdAt),
  ],
);

export const foodOrderLine = pgTable(
  "food_order_line",
  {
    id: uuid().primaryKey().defaultRandom(),
    foodOrderId: uuid()
      .notNull()
      .references(() => foodOrder.id, { onDelete: "cascade" }),
    articleId: uuid()
      .notNull()
      .references(() => article.id),
    quantity: integer().notNull(),
  },
  (t) => [
    check("food_order_line_quantity", sql`${t.quantity} between 1 and 20`),
    uniqueIndex("food_order_line_unique").on(t.foodOrderId, t.articleId),
  ],
);

/**
 * Gelernte Zuordnung „Text auf dem Kassenbon → Artikel“ für die Bon-Erkennung,
 * z. B. „KROMB.PILS 20X0,5L“ → Pils, 20 Stück je Bon-Menge.
 */
export const purchaseAlias = pgTable(
  "purchase_alias",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Bon-Text, vereinheitlicht (Großbuchstaben, einfache Leerzeichen) */
    text: text().notNull(),
    articleId: uuid()
      .notNull()
      .references(() => article.id, { onDelete: "cascade" }),
    /** Stückartikel: Stück je Menge auf dem Bon (z. B. 20 für eine Kiste) */
    unitsPerItem: integer(),
    /** Ausschank-Artikel: Flaschengröße in ml */
    bottleMl: integer(),
    updatedAt: createdAt(),
  },
  (t) => [
    uniqueIndex("purchase_alias_text_unique").on(t.text),
    check("purchase_alias_units", sql`${t.unitsPerItem} is null or ${t.unitsPerItem} between 1 and 1000`),
  ],
);

/** Tabellen, die per Trigger gegen UPDATE/DELETE geschützt sind. */
export const appendOnlyTables = [
  "sale",
  "sale_line",
  "payment",
  "purchase",
  "purchase_line",
  "cash_movement",
  "cash_count",
  "inventory_count",
  "inventory_line",
] as const;
