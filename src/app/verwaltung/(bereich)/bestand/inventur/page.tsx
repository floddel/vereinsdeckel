import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { getStockOverview } from "@/server/stock";
import { requireVerwaltung } from "@/server/session";
import { InventoryForm } from "./inventory-form";

export default function InventurPage() {
  return (
    <>
      <Button nativeButton={false} variant="ghost" className="mb-4 -ml-2 text-[15px] text-primary hover:text-primary" render={<Link href="/verwaltung/bestand" />}>
        <ChevronLeft className="size-5" /> Bestand
      </Button>
      <PageHeader
        title="Inventur"
        description="Zähl, was wirklich da ist. Angebrochene Flaschen grob schätzen (¼ · ½ · ¾) – das reicht. Leere Felder bleiben wie berechnet."
      />
      <Suspense fallback={<Loading />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  await requireVerwaltung();
  const { rows } = await getStockOverview(getDb());
  return (
    <InventoryForm
      rows={rows.map((r) => ({
        articleId: r.articleId,
        name: r.name,
        note: r.note,
        categoryName: r.categoryName,
        stock: r.stock,
        servingMl: r.servingMl,
        bottleMl: r.bottleMl,
        packSize: r.packSize,
      }))}
    />
  );
}
