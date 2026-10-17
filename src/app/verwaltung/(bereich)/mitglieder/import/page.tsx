import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { requireVerwaltung } from "@/server/session";
import { ImportForm } from "./import-form";

export default function ImportPage() {
  return (
    <>
      <Button nativeButton={false} variant="ghost" className="mb-4 -ml-2 text-[15px] text-primary hover:text-primary" render={<Link href="/verwaltung/mitglieder" />}>
        <ChevronLeft className="size-5" /> Alle Mitglieder
      </Button>
      <PageHeader
        title="Mitglieder importieren"
        description="Jedes neue Mitglied bekommt automatisch einen persönlichen Link. Namen, die es schon gibt, werden übersprungen."
      />
      <Suspense fallback={<Loading />}>
        <Gate />
      </Suspense>
    </>
  );
}

async function Gate() {
  await requireVerwaltung();
  return <ImportForm />;
}
