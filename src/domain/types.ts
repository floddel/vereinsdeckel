/** Einfache Datenformen für die Geschäftslogik (unabhängig von der Datenbank). */

/** Eine Verkaufsposition (auch Storno-Position mit negativer Menge). */
export interface LineEntry {
  kind: "line";
  id: string;
  at: Date;
  articleId: string;
  articleName: string;
  /** Strich-Gruppe; leer = Artikelname. */
  tallyGroup?: string | null;
  icon?: string | null;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  isGuest: boolean;
  reversesLineId?: string | null;
}

/** Eine Zahlung (auch Zahlungs-Storno mit negativen Beträgen). */
export interface PaymentEntry {
  kind: "payment";
  id: string;
  at: Date;
  methodId: string;
  amountCents: number;
  tipCents: number;
  reversesPaymentId?: string | null;
}

export type AccountEntry = LineEntry | PaymentEntry;
