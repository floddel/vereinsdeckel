import { TriangleAlert } from "lucide-react";
import { isTestOrigin } from "@/lib/origin";

/** Warnt, wenn Links/QR-Codes noch auf eine Test-Adresse zeigen (nicht drucken!). */
export function TestAddressWarning({ origin }: { origin: string }) {
  if (!isTestOrigin(origin)) return null;
  return (
    <div
      role="note"
      className="mb-6 flex gap-3 rounded-2xl bg-highlight/12 p-4 print:hidden"
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
      <div className="flex flex-col gap-1">
        <p className="font-semibold">Test-Adresse – QR-Karten noch nicht drucken</p>
        <p className="text-muted-foreground">
          Die Links zeigen gerade auf <strong className="text-foreground">{origin}</strong>. Das funktioniert nur hier
          im Heimnetz. Sobald die App online ist, passen sich Links und QR-Codes auf dem Bildschirm
          automatisch an – erst dann drucken.
        </p>
      </div>
    </div>
  );
}
