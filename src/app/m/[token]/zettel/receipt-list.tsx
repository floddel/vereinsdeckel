"use client";

import { Download, FileDown, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Receipt } from "@/components/coaster/receipt";
import type { Receipt as ReceiptData } from "@/domain/member-view";

type Page = { receipts: ReceiptData[]; nextBefore: string | null };

/** Kassenzettel, neueste zuerst; ältere werden beim Herunterscrollen nachgeladen. */
export function ReceiptList({ token, clubName, initial }: { token: string; clubName: string; initial: Page }) {
  const [receipts, setReceipts] = useState(initial.receipts);
  const [next, setNext] = useState(initial.nextBefore);
  const [loading, setLoading] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!next || !sentinel.current) return;
    const observer = new IntersectionObserver(async ([entry]) => {
      if (!entry.isIntersecting || loading) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/m/${encodeURIComponent(token)}/zettel?before=${next}`, { cache: "no-store" });
        if (res.ok) {
          const page = (await res.json()) as Page;
          setReceipts((r) => [...r, ...page.receipts]);
          setNext(page.nextBefore);
        }
      } finally {
        setLoading(false);
      }
    });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [next, loading, token]);

  if (receipts.length === 0) return <p className="py-10 text-muted-foreground">Noch keine Kassenzettel.</p>;

  return (
    <div className="flex flex-col items-center gap-10">
      {receipts.map((r) => (
        <ReceiptWithDownload key={r.businessDate} token={token} clubName={clubName} receipt={r} />
      ))}
      {next && (
        <div ref={sentinel} className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Ältere Kassenzettel …
        </div>
      )}
    </div>
  );
}

function ReceiptWithDownload({ token, clubName, receipt }: { token: string; clubName: string; receipt: ReceiptData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!ref.current) return;
    setBusy(true);
    try {
      // Bild wird im Handy erzeugt – nichts verlässt das Gerät
      const { toPng } = await import("html-to-image");
      const url = await toPng(ref.current, { pixelRatio: 2, backgroundColor: "transparent" });
      const a = document.createElement("a");
      a.href = url;
      a.download = `Kassenzettel-${receipt.businessDate}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <Receipt ref={ref} clubName={clubName} receipt={receipt} />
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex h-11 items-center gap-2 rounded-full bg-card px-5 font-semibold shadow-soft dark:ring-1 dark:ring-white/5 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} Als Bild speichern
        </button>
        <a
          href={`/api/m/${encodeURIComponent(token)}/zettel/${receipt.businessDate}`}
          download={`Kassenzettel-${receipt.businessDate}.pdf`}
          className="flex h-11 items-center gap-2 rounded-full bg-card px-5 font-semibold shadow-soft dark:ring-1 dark:ring-white/5"
        >
          <FileDown className="size-4" /> Als PDF
        </a>
      </div>
    </div>
  );
}
