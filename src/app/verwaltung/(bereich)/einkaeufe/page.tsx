import { Plus, ReceiptText } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { SOURCE_LABEL } from "@/domain/purchase";
import { formatBusinessDayNumeric } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { listPurchases } from "@/server/purchases";
import { requireVerwaltung } from "@/server/session";

export default function EinkaeufePage() {
  return (
    <>
      <PageHeader
        title="Einkäufe"
        description="Was eingekauft wurde, woraus es bezahlt wurde und was es je Stück gekostet hat."
        actions={
          <Button nativeButton={false} size="lg" render={<Link href="/verwaltung/einkaeufe/neu" />}>
            <Plus /> Einkauf erfassen
          </Button>
        }
      />
      <Suspense fallback={<Loading />}>
        <List />
      </Suspense>
    </>
  );
}

async function List() {
  await requireVerwaltung();
  const purchases = await listPurchases(getDb());
  if (purchases.length === 0) {
    return <p className="text-muted-foreground">Noch keine Einkäufe erfasst.</p>;
  }
  return (
    <ul className="flex max-w-3xl flex-col gap-2">
      {purchases.map((p) => (
        <li key={p.id}>
          <Link
            href={`/verwaltung/einkaeufe/${p.id}`}
            className={cn(
              "flex items-center gap-4 rounded-2xl bg-card p-4 shadow-soft dark:ring-1 dark:ring-white/5 hover:ring-2 hover:ring-primary",
              p.reversedReason && "opacity-60",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {formatBusinessDayNumeric(p.purchasedOn)}
                <Badge variant="secondary">{SOURCE_LABEL[p.source]}</Badge>
                {p.reversedReason && <Badge variant="outline">storniert</Badge>}
                {p.receiptFileId && <ReceiptText className="size-4 text-muted-foreground" aria-label="mit Beleg" />}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {p.lines.map((l) => `${l.quantity}× ${l.description}`).join(", ")}
                {p.note && ` · ${p.note}`}
              </p>
            </div>
            <span className={cn("shrink-0 font-heading text-lg font-bold tabular-nums", p.reversedReason && "line-through")}>
              {formatCents(p.totalCents)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
