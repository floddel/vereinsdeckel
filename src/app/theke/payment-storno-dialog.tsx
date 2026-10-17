"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PaymentSummary } from "@/domain/theke";
import { formatCents } from "@/lib/money";
import { ReasonPicker, reasonText } from "./reason-picker";
import { formatTime } from "./sale-list";

/** Zahlungs-Storno: immer die ganze Zahlung inkl. Trinkgeld, mit Begründung. */
export function PaymentStornoDialog({
  summary,
  member,
  onClose,
  onConfirm,
}: {
  summary: PaymentSummary | null;
  member?: { name: string };
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const value = reasonText(reason, otherText);
  const p = summary?.payment;
  return (
    <Dialog
      open={summary !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          setReason(null);
          setOtherText("");
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {p && (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl">Zahlung stornieren</DialogTitle>
              <DialogDescription className="text-base">
                {member?.name ?? "Unbekannt"} um {formatTime(p.createdAt)} Uhr: {formatCents(p.amountCents)}
                {p.tipCents > 0 && ` + ${formatCents(p.tipCents)} Trinkgeld`}. Der Betrag ist danach wieder offen.
              </DialogDescription>
            </DialogHeader>
            <ReasonPicker reason={reason} otherText={otherText} onReason={setReason} onOtherText={setOtherText} />
            <DialogFooter>
              <Button size="lg" className="h-12 w-full text-base" disabled={!value} onClick={() => value && onConfirm(value)}>
                Zahlung stornieren · {formatCents(p.amountCents + p.tipCents)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
