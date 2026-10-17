import { ExternalLink, Printer } from "lucide-react";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { getDb } from "@/db/client";
import { formatBusinessDay } from "@/lib/date";
import { requireVerwaltung } from "@/server/session";
import { getTodayAdmin } from "@/server/today";
import { SpecialsCard, TipCard } from "./today-forms";

export default function HeutePage() {
  return (
    <>
      <PageHeader
        title="Heute an der Theke"
        description="Was Mitglieder und Gäste über den QR-Code am Tresen sehen: selbst Gekochtes, Tipp des Hauses und alles, was da ist."
        actions={
          <>
            <Button nativeButton={false} variant="outline" size="lg" render={<a href="/karte" target="_blank" rel="noopener" />}>
              <ExternalLink /> Karte ansehen
            </Button>
            <Button nativeButton={false} variant="outline" size="lg" render={<a href="/verwaltung/heute/aufsteller" />}>
              <Printer /> Aufsteller drucken
            </Button>
          </>
        }
      />
      <Suspense fallback={<Loading />}>
        <Heute />
      </Suspense>
    </>
  );
}

async function Heute() {
  await requireVerwaltung();
  const data = await getTodayAdmin(getDb());
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <SpecialsCard specials={data.specials} day={formatBusinessDay(data.today)} />
      <TipCard tip={data.tip} options={data.tipOptions} suggestions={data.suggestions} />
    </div>
  );
}
