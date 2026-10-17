/**
 * Bezahlen: Aufteilung eines erhaltenen Betrags in
 * - amountCents: mindert den offenen Betrag (höchstens so viel wie offen ist)
 * - tipCents:    Trinkgeld ("Stimmt so"), fließt in den Topf, nicht aufs Konto
 * - changeCents: Rückgeld, das zurückgegeben wird
 * Zu viel bezahlt wird nie Guthaben, sondern entweder Rückgeld oder Trinkgeld.
 */
export interface PaymentSplit {
  amountCents: number;
  tipCents: number;
  changeCents: number;
}

export function splitPayment(input: {
  openCents: number;
  receivedCents: number;
  /** true = "Stimmt so": Mehrbetrag ist Trinkgeld. false = Mehrbetrag wird zurückgegeben. */
  keepChange: boolean;
}): PaymentSplit {
  const { openCents, receivedCents, keepChange } = input;
  if (!Number.isSafeInteger(receivedCents) || receivedCents <= 0) {
    throw new Error("Erhaltener Betrag muss größer als 0 sein");
  }
  const amountCents = Math.min(receivedCents, Math.max(openCents, 0));
  const excess = receivedCents - amountCents;
  const split = keepChange
    ? { amountCents, tipCents: excess, changeCents: 0 }
    : { amountCents, tipCents: 0, changeCents: excess };
  if (split.amountCents + split.tipCents <= 0) {
    throw new Error("Es ist nichts offen – nichts zu buchen");
  }
  return split;
}

/** Rückgeld-Rechner: gegeben − zu zahlen. Negativ = es fehlt noch Geld. */
export function changeCents(givenCents: number, dueCents: number): number {
  return givenCents - dueCents;
}

/** Vorschläge für Scheine an der Theke: nächster passender Schein/Betrag über dem offenen Betrag. */
export function cashSuggestions(dueCents: number): number[] {
  if (dueCents <= 0) return [];
  const notes = [500, 1000, 2000, 5000, 10000];
  const roundedUp = Math.ceil(dueCents / 100) * 100;
  const out = new Set<number>([dueCents]);
  if (roundedUp > dueCents) out.add(roundedUp);
  for (const note of notes) if (note > dueCents) out.add(note);
  return [...out].sort((a, b) => a - b).slice(0, 4);
}
