import type { Ref } from "react";
import type { Receipt as ReceiptData } from "@/domain/member-view";
import { formatBusinessDayNumeric, formatTimeBerlin } from "@/lib/date";
import { formatCentsPlain } from "@/lib/money";
import { cn } from "@/lib/utils";

const METHOD: Record<string, string> = { cash: "Bar", paypal: "PayPal" };

function Row({ left, right, muted, bold }: { left: string; right: string; muted?: boolean; bold?: boolean }) {
  return (
    <p className={cn("flex justify-between gap-3", muted && "text-neutral-500", bold && "text-lg font-bold")}>
      <span>{left}</span>
      <span className="shrink-0 tabular-nums">{right}</span>
    </p>
  );
}

/**
 * Kassenzettel eines Abends wie ein echter Bon (Thermopapier, Courier Prime, gezackter Abriss).
 * ref: wird zum Speichern als Bild abfotografiert.
 */
export function Receipt({ clubName, receipt: r, ref }: { clubName: string; receipt: ReceiptData; ref?: Ref<HTMLDivElement> }) {
  const timeFrom = formatTimeBerlin(r.from);
  const timeTo = formatTimeBerlin(r.to);
  return (
    <div
      ref={ref}
      data-testid="kassenzettel"
      className="w-80 shrink-0 font-receipt text-[15px] leading-snug text-neutral-900 drop-shadow-[0_8px_16px_rgb(0_0_0/0.18)]"
    >
      <div className="bg-white px-5 pt-6 pb-3">
        <p className="text-center text-base font-bold tracking-wide uppercase">{clubName}</p>
        <p className="text-center">Kassenzettel{r.title ? ` · ${r.title}` : ""}</p>
        <p className="mb-1 text-center text-neutral-500">
          {formatBusinessDayNumeric(r.businessDate)} · {timeFrom === timeTo ? timeFrom : `${timeFrom}–${timeTo}`}
        </p>
        <hr className="my-2 border-t-2 border-dashed border-neutral-300" />
        {r.lines.map((l, i) => (
          <div key={i}>
            <Row
              left={`${l.quantity} x ${l.articleName}${l.isGuest ? " (Gast)" : ""}`}
              right={formatCentsPlain(l.totalCents)}
              muted={l.reversal}
            />
            {l.reversal && l.reason && <p className="pl-4 text-neutral-500">Storno: {l.reason}</p>}
          </div>
        ))}
        {r.lines.length > 0 && (
          <>
            <hr className="my-2 border-t-2 border-dashed border-neutral-300" />
            <Row left="SUMME" right={`${formatCentsPlain(r.totalCents)} EUR`} bold />
          </>
        )}
        {r.payments.map((p, i) => (
          <div key={i}>
            {p.cashGivenCents !== null && !p.reversal && <Row left="Bar gegeben" right={formatCentsPlain(p.cashGivenCents)} />}
            <Row
              left={p.reversal ? `Storno Zahlung ${METHOD[p.methodId] ?? ""}` : `${METHOD[p.methodId] ?? p.methodId} bezahlt`}
              right={formatCentsPlain(p.amountCents)}
              muted={p.reversal}
            />
            {p.tipCents !== 0 && <Row left={p.reversal ? "Storno Trinkgeld" : "Trinkgeld"} right={formatCentsPlain(p.tipCents)} muted={p.reversal} />}
            {p.reversal && p.reason && <p className="pl-4 text-neutral-500">{p.reason}</p>}
          </div>
        ))}
        <hr className="my-2 border-t-2 border-dashed border-neutral-300" />
        <Row left="Offen danach" right={formatCentsPlain(Math.max(r.openAfterCents, 0))} bold={r.openAfterCents > 0} />
        <p className="mt-3 text-center">Danke &amp; Prost!</p>
      </div>
      {/* gezackter Abriss */}
      <div
        className="h-3"
        style={{
          background:
            "linear-gradient(-45deg, transparent 6px, white 0) 0 0 / 12px 12px repeat-x, linear-gradient(45deg, transparent 6px, white 0) 0 0 / 12px 12px repeat-x",
        }}
      />
    </div>
  );
}
