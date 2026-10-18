import { eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import { formatBusinessDayNumeric, formatTimeBerlin } from "@/lib/date";
import { getAiSettings } from "@/server/anthropic";
import { listDevices } from "@/server/devices";
import { requireVerwaltung } from "@/server/session";
import { GlassSlider, ThemeSwitch } from "@/components/theme-switch";
import { AiSettingsCard } from "./ai-settings";
import { DevicesCard, PasswordForm, TwoFactorCard } from "./security-settings";
import { isAccent } from "@/lib/accent";
import { isDemo } from "@/lib/demo";
import { AccentForm, GeneralSettingsForm, LogoForm, PinForm } from "./settings-forms";
import { TestPhaseCard } from "./test-phase-card";

/** „Do., 15.10.2026, 20:58“ (deutsche Zeit) */
const dateTime = (iso: string) => `${formatBusinessDayNumeric(businessDate(new Date(iso), 0))}, ${formatTimeBerlin(iso)}`;

export default function EinstellungenPage() {
  return (
    <>
      <PageHeader title="Einstellungen" />
      <Suspense fallback={<Loading />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  const { session, user } = await requireVerwaltung();
  const db = getDb();
  const [[s], ai, devices] = await Promise.all([
    db.select().from(settings).where(eq(settings.id, 1)),
    getAiSettings(db),
    listDevices(db, session.id),
  ]);
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {isDemo() && (
        <p role="note" className="rounded-2xl bg-primary/10 p-4">
          In der Demo ausgeschaltet: Passwort, PIN und zweiten Faktor ändern, Kassenbon-Erkennung, Vereinslogo und
          eine Sicherung übernehmen.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Darstellung</CardTitle>
          <CardDescription>Hell oder dunkel und wie stark das Glas der Leisten wirkt. Gilt nur für dieses Gerät.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ThemeSwitch />
          <GlassSlider />
        </CardContent>
      </Card>
      <AccentForm accent={isAccent(s.accent) ? s.accent : "blau"} />
      <LogoForm logoFileId={s.logoFileId} />
      <GeneralSettingsForm
        s={{
          clubName: s.clubName,
          paypalName: s.paypalName,
          warnLimitCents: s.warnLimitCents,
          businessDayCutoffHour: s.businessDayCutoffHour,
          lowStockEvenings: s.lowStockEvenings,
          logoFileId: s.logoFileId,
        }}
      />
      <AiSettingsCard ai={ai} />
      <TwoFactorCard enabled={!!user.twoFactorEnabled} />
      <PinForm />
      <PasswordForm />
      <TestPhaseCard endedOn={s.testPhaseEndedAt ? dateTime(s.testPhaseEndedAt.toISOString()) : null} />
      <Card>
        <CardHeader>
          <CardTitle>Sichern & Umziehen</CardTitle>
          <CardDescription>Alle Daten als Datei herunterladen – oder eine Sicherung in eine frische Installation übernehmen.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/verwaltung/sicherung" className="text-primary underline">
            Zu „Sichern & Umziehen“
          </Link>
        </CardContent>
      </Card>
      <DevicesCard
        devices={devices.map((d) => ({
          id: d.id,
          current: d.current,
          since: dateTime(d.createdAt),
          lastActive: formatBusinessDayNumeric(businessDate(new Date(d.lastActiveAt), 0)),
        }))}
      />
    </div>
  );
}
