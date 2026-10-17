import { Code, ExternalLink, Heart, Scale } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Loading, PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ABOUT, sourceCodeUrl } from "@/lib/about";
import { requireVerwaltung } from "@/server/session";

export const metadata: Metadata = { title: "Über Vereinsdeckel" };

/**
 * Angemessene rechtliche Hinweise (AGPL-3.0, § 0 und § 7 b): Urheber, Lizenz, Gewährleistungsausschluss,
 * Quellcode (§ 13) – und die Möglichkeit, die Entwicklung zu unterstützen.
 */
export default function UeberPage() {
  return (
    <>
      <PageHeader title="Über Vereinsdeckel" description={ABOUT.tagline} />
      <Suspense fallback={<Loading />}>
        <Ueber />
      </Suspense>
    </>
  );
}

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

async function Ueber() {
  await requireVerwaltung();
  await connection();
  const source = sourceCodeUrl();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Card data-testid="unterstuetzen" className="ring-2 ring-highlight/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="size-5 text-highlight" aria-hidden /> Unterstützen
          </CardTitle>
          <CardDescription>
            Der Vereinsdeckel ist kostenlos und wird in der Freizeit entwickelt. Wenn er eurem Verein hilft, freut sich {ABOUT.author} über eine
            kleine Spende – sie fließt in Weiterentwicklung und Pflege.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <a href={ABOUT.sponsorsUrl} {...external} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground">
            <Heart className="size-4" aria-hidden /> GitHub Sponsors
          </a>
          <a href={ABOUT.paypalUrl} {...external} className="inline-flex items-center gap-2 rounded-full border px-5 py-2.5 font-semibold hover:bg-muted">
            PayPal <ExternalLink className="size-4" aria-hidden />
          </a>
        </CardContent>
      </Card>

      <Card data-testid="lizenz">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="size-5" aria-hidden /> Lizenz und Urheberrecht
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 leading-relaxed">
          <p>
            <strong>{ABOUT.name}</strong> Version {ABOUT.version} – Copyright © 2026 {ABOUT.author}
          </p>
          <p>
            Freie Software unter der{" "}
            <a href={ABOUT.licenseUrl} {...external} className="text-primary underline">
              {ABOUT.license}
            </a>
            : Ihr dürft sie nutzen, weitergeben und verändern. Wer eine veränderte Version für andere betreibt, muss deren Quellcode offenlegen und den
            Hinweis „{ABOUT.name} – von {ABOUT.author}“ sichtbar lassen.
          </p>
          <p className="text-sm text-muted-foreground">
            Dieses Programm wird in der Hoffnung verbreitet, dass es nützlich ist, aber OHNE JEDE GEWÄHRLEISTUNG – sogar ohne die implizite
            Gewährleistung der MARKTREIFE oder der VERWENDBARKEIT FÜR EINEN BESTIMMTEN ZWECK. Der Vereinsdeckel ist keine zertifizierte
            Registrierkasse (KassenSichV/TSE).
          </p>
        </CardContent>
      </Card>

      <Card data-testid="quellcode">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Code className="size-5" aria-hidden /> Quellcode
          </CardTitle>
          <CardDescription>Der vollständige Quellcode dieser Installation, mit Anleitungen zu Installation, Updates und Sicherung.</CardDescription>
        </CardHeader>
        <CardContent>
          <a href={source} {...external} className="font-mono break-all text-primary underline">
            {source}
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
