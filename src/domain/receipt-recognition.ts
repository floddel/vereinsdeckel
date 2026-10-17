import { z } from "@/lib/z";
import { formatVolume } from "./volume";

/**
 * Kassenbon-Erkennung: Was die KI liefern soll (Tool-Aufruf mit festem Schema), wie wir es prüfen
 * und in Formularzeilen für den Einkauf übersetzen. Die KI schlägt nur vor – gespeichert wird erst
 * nach dem Prüfen im Formular.
 */

export interface RecognitionArticle {
  id: string;
  name: string;
  servingMl: number | null;
  bottleMl: number | null;
  packSize: number | null;
  /** Notiz der Verwaltung, z. B. welche Marken dazugehören */
  note?: string | null;
}

export interface Alias {
  text: string;
  articleId: string;
  unitsPerItem: number | null;
  bottleMl: number | null;
}

/** Bon-Text vereinheitlichen, damit „Kromb. Pils  20x0,5l“ und „KROMB. PILS 20X0,5L“ gleich sind. */
export const normalizeReceiptText = (s: string) => s.toUpperCase().replace(/\s+/g, " ").trim();

export const TOOL_NAME = "einkauf_erfassen";

/** JSON-Schema für den Tool-Aufruf (so antwortet die KI immer in derselben Form). */
export const TOOL_INPUT_SCHEMA = {
  type: "object",
  properties: {
    haendler: { type: ["string", "null"], description: "Name des Geschäfts, z. B. „Metro Kassel“" },
    datum: { type: ["string", "null"], description: "Einkaufsdatum als JJJJ-MM-TT" },
    summe_cents: { type: ["integer", "null"], description: "Endsumme laut Bon in Cent (inkl. Pfand)" },
    positionen: {
      type: "array",
      items: {
        type: "object",
        properties: {
          bon_text: { type: "string", description: "Text der Zeile genau wie auf dem Bon" },
          menge: { type: "integer", minimum: 1, description: "Anzahl wie auf dem Bon (z. B. 2 Kisten)" },
          gesamt_cents: { type: ["integer", "null"], description: "Preis der Zeile in Cent, Rabatte schon abgezogen" },
          artikel_id: { type: ["string", "null"], description: "ID aus der Artikelliste, wenn sicher passend, sonst null" },
          stueck_je_menge: { type: ["integer", "null"], description: "Stückartikel: Flaschen/Stück je Menge, z. B. 20 bei einer 20er-Kiste" },
          flasche_ml: { type: ["integer", "null"], description: "Ausschank-Artikel: Flaschengröße in ml, z. B. 700" },
        },
        required: ["bon_text", "menge", "gesamt_cents", "artikel_id", "stueck_je_menge", "flasche_ml"],
      },
    },
  },
  required: ["haendler", "datum", "summe_cents", "positionen"],
} as const;

const cents = z.number().int().min(0).max(10_000_000);
export const recognitionSchema = z.object({
  haendler: z.string().trim().max(80).nullable().catch(null),
  datum: z.iso.date().nullable().catch(null),
  summe_cents: cents.nullable().catch(null),
  positionen: z
    .array(
      z.object({
        bon_text: z.string().trim().min(1).max(120),
        menge: z.number().int().min(1).max(10_000),
        gesamt_cents: cents.nullable().catch(null),
        artikel_id: z.string().nullable().catch(null),
        stueck_je_menge: z.number().int().min(1).max(1000).nullable().catch(null),
        flasche_ml: z.number().int().min(1).max(50_000).nullable().catch(null),
      }),
    )
    .max(80),
});
export type Recognition = z.output<typeof recognitionSchema>;

/** Anweisung an die KI – mit der Artikelliste des Vereins und den gelernten Zuordnungen. */
export function buildPrompt(articles: readonly RecognitionArticle[], aliases: readonly Alias[]): string {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const list = articles
    .map((a) => {
      const kind = a.servingMl
        ? `Ausschank ${formatVolume(a.servingMl)}${a.bottleMl ? `, übliche Flasche ${formatVolume(a.bottleMl)}` : ""}`
        : `Stück${a.packSize ? `, Kiste ${a.packSize}` : ""}`;
      return `- id=${a.id} · ${a.name} · ${kind}${a.note ? ` · umfasst: ${a.note}` : ""}`;
    })
    .join("\n");
  const known = aliases
    .filter((x) => byId.has(x.articleId))
    .map((x) => {
      const unit = x.unitsPerItem ? ` (${x.unitsPerItem} Stück je Menge)` : x.bottleMl ? ` (Flasche ${formatVolume(x.bottleMl)})` : "";
      return `- „${x.text}“ → ${byId.get(x.articleId)!.name}${unit}`;
    })
    .join("\n");
  return [
    "Du liest den Kassenbon eines Vereinsheims (meist Getränke-Großhandel) und trägst den Einkauf über das Werkzeug ein.",
    "Regeln:",
    "- Jede Warenzeile des Bons ist eine Position. Pfand, Leergut-Rückgabe und Tüten sind eigene Positionen ohne artikel_id.",
    "- Rabatte und Gutschriften mit der zugehörigen Position verrechnen. Keine negativen Beträge.",
    "- Beträge immer in Cent. summe_cents ist die Endsumme laut Bon.",
    "- artikel_id nur setzen, wenn die Zeile sicher zu einem Artikel aus der Liste passt (Sorte und Größe beachten), sonst null.",
    "- Sammelartikel („umfasst: …“) gelten für alle dort genannten Marken und Sorten.",
    "- Stückartikel: stueck_je_menge = Flaschen bzw. Stück pro Menge auf dem Bon (20er-Kiste → 20, Einzelflasche → 1).",
    "- Ausschank-Artikel: flasche_ml = Inhalt einer Flasche in ml (0,7 l → 700). menge = Anzahl Flaschen.",
    "- Zeigt das Foto keinen Bon, sondern Ware (Kisten, Flaschen): erkenne Produkte und Anzahl, Preise und Summe dann null.",
    "- Unlesbares weglassen statt raten.",
    "",
    "Artikelliste des Vereins:",
    list || "(keine Artikel)",
    ...(known ? ["", "Schon bekannte Zuordnungen (bitte übernehmen):", known] : []),
  ].join("\n");
}

/** Eine vorgeschlagene Formularzeile (wie im Einkaufsformular). */
export interface SuggestedLine {
  receiptText: string;
  /** Menge laut Bon (zum Lernen der Zuordnung) */
  receiptQty: number;
  articleId: string | null;
  description: string;
  crates: number;
  count: number;
  bottleMl: number | null;
  totalCents: number | null;
  /** aus einer gelernten Zuordnung (sicher) statt von der KI vermutet */
  fromAlias: boolean;
}

export interface Suggestion {
  purchasedOn: string | null;
  merchant: string | null;
  receiptTotalCents: number | null;
  lines: SuggestedLine[];
}

/** KI-Antwort → Formularzeilen. Gelernte Zuordnungen haben Vorrang, unbekannte Artikel-IDs werden verworfen. */
export function toSuggestion(r: Recognition, articles: readonly RecognitionArticle[], aliases: readonly Alias[]): Suggestion {
  const byId = new Map(articles.map((a) => [a.id, a]));
  const aliasOf = new Map(aliases.map((a) => [a.text, a]));
  return {
    purchasedOn: r.datum,
    merchant: r.haendler,
    receiptTotalCents: r.summe_cents,
    lines: r.positionen.map((p) => {
      const alias = aliasOf.get(normalizeReceiptText(p.bon_text));
      const article = byId.get(alias?.articleId ?? p.artikel_id ?? "") ?? null;
      const base = { receiptText: p.bon_text, receiptQty: p.menge, totalCents: p.gesamt_cents, fromAlias: !!alias && !!article };
      if (!article) return { ...base, articleId: null, description: p.bon_text, crates: 0, count: p.menge, bottleMl: null, fromAlias: false };
      if (article.servingMl) {
        const bottleMl = alias?.bottleMl ?? p.flasche_ml ?? article.bottleMl;
        return { ...base, articleId: article.id, description: "", crates: 0, count: p.menge, bottleMl };
      }
      const perItem = alias?.unitsPerItem ?? p.stueck_je_menge ?? 1;
      // ganze Kisten als Kisten eintragen, sonst als Stück
      if (article.packSize && perItem === article.packSize) {
        return { ...base, articleId: article.id, description: "", crates: p.menge, count: 0, bottleMl: null };
      }
      return { ...base, articleId: article.id, description: "", crates: 0, count: p.menge * perItem, bottleMl: null };
    }),
  };
}

/** Was nach dem Speichern gelernt wird: Bon-Text → Artikel (+ Stück je Menge bzw. Flaschengröße). */
export function aliasFromLine(l: {
  receiptText: string;
  receiptQty: number;
  articleId: string | null;
  quantity: number;
  bottleMl: number | null;
  served: boolean;
}): Alias | null {
  if (!l.articleId || !l.receiptText.trim()) return null;
  const text = normalizeReceiptText(l.receiptText);
  if (l.served) return { text, articleId: l.articleId, unitsPerItem: null, bottleMl: l.bottleMl };
  const per = l.quantity / Math.max(l.receiptQty, 1);
  return { text, articleId: l.articleId, unitsPerItem: Number.isInteger(per) && per >= 1 && per <= 1000 ? per : null, bottleMl: null };
}
