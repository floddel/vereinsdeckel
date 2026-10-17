import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { businessDate } from "@/domain/business-date";
import { getDb } from "@/db/client";
import { getAiSettings } from "@/server/anthropic";
import { getArticlesByCategory } from "@/server/queries/articles";
import { requireVerwaltung } from "@/server/session";
import { PurchaseForm } from "./purchase-form";

export default function NeuerEinkaufPage() {
  return (
    <>
      <Button nativeButton={false} variant="ghost" className="mb-4 -ml-2 text-[15px] text-primary hover:text-primary" render={<Link href="/verwaltung/einkaeufe" />}>
        <ChevronLeft className="size-5" /> Alle Einkäufe
      </Button>
      <PageHeader title="Einkauf erfassen" description="Ein Kassenbon = ein Einkauf. Der Bestand der Artikel erhöht sich automatisch." />
      <Suspense fallback={<Loading />}>
        <Form />
      </Suspense>
    </>
  );
}

async function Form() {
  await requireVerwaltung();
  const groups = (await getArticlesByCategory())
    .map((g) => ({
      name: g.category.name,
      articles: g.articles
        // „Bestand aus“-Artikel haben keinen eigenen Bestand (eingekauft wird der andere Artikel)
        .filter((a) => a.active && !a.stockArticleId)
        .map((a) => ({ id: a.id, name: a.name, priceCents: a.priceCents, servingMl: a.servingMl, bottleMl: a.bottleMl, packSize: a.packSize })),
    }))
    .filter((g) => g.articles.length > 0);
  // Kalendertag in Berlin (nicht der Geschäftstag mit Wechsel um 6 Uhr)
  const ai = await getAiSettings(getDb());
  return <PurchaseForm groups={groups} today={businessDate(new Date(), 0)} aiEnabled={ai.enabled && !!ai.keyHint} />;
}
