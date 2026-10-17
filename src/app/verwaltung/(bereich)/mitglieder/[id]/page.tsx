import { ChevronLeft, FileDown } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/admin/page-header";
import { TestAddressWarning } from "@/components/admin/test-address-warning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getDb } from "@/db/client";
import { businessDate } from "@/domain/business-date";
import { formatBusinessDayNumeric } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { getMemberReceipts } from "@/server/member-view";
import { qrSvg } from "@/lib/qr";
import { getAppOrigin, memberUrl } from "@/server/app-url";
import { getMember, memberHasBookings } from "@/server/queries/members";
import { requireVerwaltung } from "@/server/session";
import { CopyLinkButton, DeleteMemberButton, EditMemberButton, LinkButtons } from "./member-actions-client";
import { PrivacyButtons } from "./privacy-buttons";

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });
const UUID = /^[0-9a-f-]{36}$/i;

export default function MitgliedPage({ params }: PageProps<"/verwaltung/mitglieder/[id]">) {
  return (
    <>
      <Button nativeButton={false} variant="ghost" className="mb-4 -ml-2 text-[15px] text-primary hover:text-primary" render={<Link href="/verwaltung/mitglieder" />}>
        <ChevronLeft className="size-5" /> Alle Mitglieder
      </Button>
      <Suspense fallback={<Loading />}>
        <MemberDetail params={params} />
      </Suspense>
    </>
  );
}

async function MemberDetail({ params }: Pick<PageProps<"/verwaltung/mitglieder/[id]">, "params">) {
  await requireVerwaltung();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const data = await getMember(id);
  if (!data || data.member.anonymizedAt) notFound();
  const { member, activeToken, tokens } = data;
  const origin = await getAppOrigin();
  const url = activeToken ? memberUrl(origin, activeToken.token) : null;
  const [svg, hasBookings, { receipts }] = await Promise.all([
    url ? qrSvg(url) : null,
    memberHasBookings(member.id),
    getMemberReceipts(getDb(), member.id, { limit: 5 }),
  ]);
  const today = businessDate(new Date(), 0);
  const openCents = receipts[0]?.openAfterCents ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">{member.name}</h1>
          {!member.active && <Badge variant="outline" className="mt-2">inaktiv</Badge>}
        </div>
        <div className="flex flex-wrap gap-2">
          <EditMemberButton member={member} />
          <DeleteMemberButton memberId={member.id} name={member.name} hasBookings={hasBookings} active={member.active} />
        </div>
      </div>

      <TestAddressWarning origin={origin} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Persönlicher Link</CardTitle>
            <CardDescription>
              Zeigt dem Mitglied nur seinen eigenen Bierdeckel und seine Buchungen. Nicht weitergeben.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {url && svg ? (
              <>
                <div
                  className="mx-auto w-56 rounded-lg bg-white p-2"
                  role="img"
                  aria-label={`QR-Code für ${member.name}`}
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
                <p className="rounded-lg bg-muted p-2 font-mono text-xs break-all" data-testid="member-url">
                  {url}
                </p>
                <div className="flex flex-wrap gap-2">
                  <CopyLinkButton url={url} />
                  <Button nativeButton={false} variant="outline" render={<Link href={`/verwaltung/mitglieder/qr?ids=${member.id}`} />}>
                    QR-Karte drucken
                  </Button>
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-destructive/10 p-3 text-destructive">
                Der Link ist gesperrt. Über alte Links und QR-Codes ist nichts mehr zu sehen.
              </p>
            )}
            <LinkButtons memberId={member.id} hasLink={!!activeToken} />
            <p className="text-sm text-muted-foreground">
              Bisher {tokens.length} {tokens.length === 1 ? "Link" : "Links"} erzeugt, zuletzt am{" "}
              {tokens[0] ? dateFormat.format(tokens[0].createdAt) : "–"}.
            </p>
          </CardContent>
        </Card>
        <Card data-testid="konto">
          <CardHeader>
            <CardTitle>Konto</CardTitle>
            <CardDescription>
              Offen: <span className="font-heading text-xl font-bold text-foreground tabular-nums">{formatCents(openCents)}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {receipts.length === 0 ? (
              <p className="text-muted-foreground">Noch keine Buchungen.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-1.5 pr-2 font-medium">Abend</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Verzehr</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Bezahlt</th>
                    <th className="py-1.5 text-right font-medium">Offen danach</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {receipts.map((r) => (
                    <tr key={r.businessDate}>
                      <td className="py-1.5 pr-2">{formatBusinessDayNumeric(r.businessDate)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatCents(r.totalCents)}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatCents(r.paidCents)}</td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{formatCents(r.openAfterCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form action={`/api/pdf/konto/${member.id}`} target="_blank" className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Von
                <Input type="date" name="von" defaultValue={`${today.slice(0, 4)}-01-01`} className="h-9 w-40" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-medium">
                Bis
                <Input type="date" name="bis" defaultValue={today} className="h-9 w-40" />
              </label>
              <Button type="submit" variant="outline">
                <FileDown /> Kontoauszug (PDF)
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
      <Card data-testid="datenschutz-mitglied">
        <CardHeader>
          <CardTitle>Datenschutz</CardTitle>
          <CardDescription>
            Fragt {member.name} nach den eigenen Daten, lädst du sie hier herunter. Möchte {member.name} gelöscht werden: anonymisieren.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PrivacyButtons memberId={member.id} name={member.name} openCents={openCents} />
        </CardContent>
      </Card>
    </div>
  );
}
