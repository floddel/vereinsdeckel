import { HandHeart } from "lucide-react";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/print-button";
import { TestAddressWarning } from "@/components/admin/test-address-warning";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { qrSvg } from "@/lib/qr";
import { getAppOrigin } from "@/server/app-url";
import { requireVerwaltung } from "@/server/session";

export default function AufstellerPage() {
  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Aufsteller für den Tresen"
          description="Ein A4-Blatt: in der Mitte knicken – dann steht es als Dreieck auf dem Tresen, mit dem QR-Code auf beiden Seiten. Der Code führt zur Karte „Was gibt's heute?“ und bleibt gleich, auch wenn sich Preise oder das Tagesgericht ändern."
          actions={<PrintButton />}
        />
      </div>
      <Suspense fallback={<Loading />}>
        <Aufsteller />
      </Suspense>
    </>
  );
}

async function Aufsteller() {
  await requireVerwaltung();
  const [[s], origin] = await Promise.all([
    getDb().select({ clubName: settings.clubName, logoFileId: settings.logoFileId }).from(settings),
    getAppOrigin(),
  ]);
  const url = `${origin}/karte`;
  const svg = await qrSvg(url);
  return (
    <>
      <TestAddressWarning origin={origin} />
      <div className="tent-sheet mx-auto flex max-w-[190mm] flex-col bg-white text-black shadow-soft print:shadow-none">
        {/* Obere Hälfte steht auf dem Kopf – nach dem Knicken sind beide Seiten richtig herum */}
        <Half clubName={s?.clubName ?? "Verein"} logoFileId={s?.logoFileId ?? null} svg={svg} url={url} flipped />
        <div className="border-t border-dashed border-neutral-400 print:border-neutral-300" aria-hidden />
        <Half clubName={s?.clubName ?? "Verein"} logoFileId={s?.logoFileId ?? null} svg={svg} url={url} />
      </div>
    </>
  );
}

function Half({ clubName, logoFileId, svg, url, flipped }: { clubName: string; logoFileId: string | null; svg: string; url: string; flipped?: boolean }) {
  return (
    <section data-testid="aufsteller" className={`tent-half flex items-center gap-8 px-10 py-8 ${flipped ? "rotate-180" : ""}`}>
      <div className="w-[70mm] shrink-0" role="img" aria-label="QR-Code zur Karte" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="flex min-w-0 flex-col gap-3">
        <p className="flex items-center gap-2 text-base text-neutral-600">
          {logoFileId && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/datei/${logoFileId}`} alt="" className="size-8 rounded-full object-cover" />
          )}
          {clubName}
        </p>
        <p className="text-4xl leading-tight font-extrabold">Was gibt&apos;s heute?</p>
        <p className="text-lg leading-snug">Mit der Handy-Kamera scannen: alle Getränke, Preise und was heute frisch gekocht ist.</p>
        <p className="text-base leading-snug text-neutral-700">
          Dein eigener Bierdeckel aufs Handy? Frag vorne nach deinem persönlichen QR-Code.
        </p>
        <p className="flex items-center gap-2 text-base font-semibold">
          <HandHeart className="size-5 shrink-0" aria-hidden /> Alles freiwillig – vorne bist du immer willkommen.
        </p>
        <p className="font-mono text-xs break-all text-neutral-500">{url}</p>
      </div>
    </section>
  );
}
