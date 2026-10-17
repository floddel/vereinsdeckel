import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  article,
  cashCount,
  cashMovement,
  event,
  file,
  foodOrder,
  inventoryCount,
  inventoryLine,
  member,
  memberToken,
  payment,
  purchase,
  purchaseLine,
  sale,
  saleLine,
  settings,
} from "@/db/schema";
import type { ResetArea, ResetPlan } from "@/domain/reset";

export type ResetResult = { ok: true; deleted: Partial<Record<ResetArea, number>> } | { ok: false; error: string };

/** Läuft die Testphase noch? (nur dann lässt sich zurücksetzen) */
export async function isTestPhase(db: Db): Promise<boolean> {
  const [s] = await db.select({ ended: settings.testPhaseEndedAt }).from(settings).where(eq(settings.id, 1));
  return !!s && s.ended === null;
}

/**
 * Daten zurücksetzen – nur in der Testphase, alles in EINER Transaktion: Entweder ist danach alles
 * Gewählte weg, oder (bei einem Fehler) gar nichts. Die Fremdschlüssel bleiben dabei aktiv.
 * Löschen in den „nur anhängen“-Tabellen erlaubt die Datenbank nur in dieser Transaktion
 * (app.reset) und nur, solange die Testphase läuft (Migration 0018).
 */
export async function resetData(db: Db, plan: ResetPlan): Promise<ResetResult> {
  if (plan.areas.length === 0) return { ok: false, error: "Bitte auswählen, was gelöscht werden soll." };
  return db.transaction(async (tx): Promise<ResetResult> => {
    // Einstellungen sperren: Niemand beendet gleichzeitig die Testphase
    const [s] = await tx.select({ ended: settings.testPhaseEndedAt }).from(settings).where(eq(settings.id, 1)).for("update");
    if (!s || s.ended) return { ok: false, error: "Die Testphase ist beendet – Daten lassen sich nicht mehr zurücksetzen." };
    await tx.execute(sql`select set_config('app.reset', 'on', true)`);

    const deleted: Partial<Record<ResetArea, number>> = {};
    const has = (a: ResetArea) => plan.areas.includes(a);

    if (has("buchungen")) {
      // Handy-Bestellungen (ihre Zeilen gehen mit), Zahlungen und Bons verweisen auf Abende
      await tx.delete(foodOrder);
      const payments = await tx.delete(payment).returning({ id: payment.id });
      await tx.delete(saleLine);
      const sales = await tx.delete(sale).returning({ id: sale.id });
      await tx.delete(event);
      await tx.update(settings).set({ kitchenOpen: false }).where(eq(settings.id, 1));
      deleted.buchungen = sales.length + payments.length;
    }
    if (has("kasse")) {
      await tx.delete(cashCount);
      deleted.kasse = (await tx.delete(cashMovement).returning({ id: cashMovement.id })).length;
    }
    if (has("einkaeufe")) {
      // Anfangsbestand behalten: Einkäufe „Anfangsbestand“, die nicht storniert sind
      const keep = plan.keepOpening
        ? (
            await tx
              .select({ id: purchase.id })
              .from(purchase)
              .where(
                and(
                  eq(purchase.source, "opening"),
                  isNull(purchase.reversesPurchaseId),
                  sql`${purchase.id} not in (select ${purchase.reversesPurchaseId} from ${purchase} where ${purchase.reversesPurchaseId} is not null)`,
                ),
              )
          ).map((p) => p.id)
        : [];
      const gone = keep.length ? notInArray(purchase.id, keep) : undefined;
      const receipts = (
        await tx
          .select({ id: purchase.receiptFileId })
          .from(purchase)
          .where(and(gone, isNotNull(purchase.receiptFileId)))
      ).map((p) => p.id as string);
      await tx.delete(purchaseLine).where(keep.length ? notInArray(purchaseLine.purchaseId, keep) : undefined);
      deleted.einkaeufe = (await tx.delete(purchase).where(gone).returning({ id: purchase.id })).length;
      if (receipts.length) await tx.delete(file).where(inArray(file.id, receipts));
    }
    if (has("inventuren")) {
      await tx.delete(inventoryLine);
      deleted.inventuren = (await tx.delete(inventoryCount).returning({ id: inventoryCount.id })).length;
    }
    if (has("mitglieder")) {
      await tx.delete(memberToken);
      deleted.mitglieder = (await tx.delete(member).returning({ id: member.id })).length;
    }
    if (has("artikel")) {
      // Gelernte Bon-Zuordnungen und der „Tipp des Hauses“ gehen über die Fremdschlüssel automatisch mit
      deleted.artikel = (await tx.delete(article).returning({ id: article.id })).length;
    }

    await tx.update(settings).set({ dataResetAt: new Date() }).where(eq(settings.id, 1));
    return { ok: true, deleted };
  });
}

/** Testphase beenden – endgültig (die Datenbank lässt den Zeitpunkt danach nicht mehr ändern). */
export async function endTestPhase(db: Db): Promise<void> {
  await db
    .update(settings)
    .set({ testPhaseEndedAt: new Date() })
    .where(and(eq(settings.id, 1), isNull(settings.testPhaseEndedAt)));
}
