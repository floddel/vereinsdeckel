"use client";

import { Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { reversePurchaseAction } from "@/server/purchase-actions";

/** Einkauf stornieren: Gegenbuchung mit Begründung (der Einkauf selbst bleibt erhalten). */
export function ReversePurchaseButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <Button variant="outline" className="text-destructive" onClick={() => setOpen(true)}>
        <Undo2 /> Stornieren
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Einkauf stornieren?</DialogTitle>
            <DialogDescription>
              Es entsteht eine Gegenbuchung: Bestand und Kasse werden zurückgerechnet. Der Einkauf bleibt als storniert sichtbar.
            </DialogDescription>
          </DialogHeader>
          <Input aria-label="Begründung" placeholder="Warum? z. B. doppelt erfasst" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button
              variant="destructive"
              disabled={!reason.trim() || pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await reversePurchaseAction(id, reason);
                  if (result && !result.ok) return void toast.error(result.error);
                  toast.success("Einkauf storniert");
                  setOpen(false);
                })
              }
            >
              Stornieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
