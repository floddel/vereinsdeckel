import { FileUp, QrCode } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Button } from "@/components/ui/button";
import { listMembers } from "@/server/queries/members";
import { requireVerwaltung } from "@/server/session";
import { MemberList } from "./member-list";

export default function MitgliederPage() {
  return (
    <>
      <PageHeader
        title="Mitglieder"
        description="Jedes Mitglied hat einen persönlichen Link zu seinem Bierdeckel (nur Lesezugriff)."
        actions={
          <>
            <Button nativeButton={false} variant="outline" render={<Link href="/verwaltung/mitglieder/import" />}>
              <FileUp /> CSV-Import
            </Button>
            <Button nativeButton={false} variant="outline" render={<Link href="/verwaltung/mitglieder/qr" />}>
              <QrCode /> QR-Codes drucken
            </Button>
          </>
        }
      />
      <Suspense fallback={<Loading />}>
        <Members />
      </Suspense>
    </>
  );
}

async function Members() {
  await requireVerwaltung();
  return <MemberList members={await listMembers()} />;
}
