"use client";

import { CircleCheck, Download, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FormError } from "@/components/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DownloadForm() {
  const [receipts, setReceipts] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={receipts} onChange={(e) => setReceipts(e.target.checked)} className="size-4 accent-primary" />
        Belegfotos der Einkäufe mitnehmen (macht die Datei größer)
      </label>
      <Button nativeButton={false} size="lg" className="self-start" render={<a href={`/api/sicherung${receipts ? "?belege=1" : ""}`} download />}>
        <Download /> Sicherung herunterladen
      </Button>
    </div>
  );
}

type Result = { ok: true; articles: number; members: number; bookings: number; stockLines: number } | { ok: false; error: string };

export function ImportForm() {
  const [mode, setMode] = useState<"stammdaten" | "alles">("stammdaten");
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (result?.ok) {
    return (
      <div data-testid="sicherung-ergebnis" className="flex flex-col gap-3">
        <p className="flex items-start gap-2 text-lg font-semibold">
          <CircleCheck className="mt-1 size-5 shrink-0 text-primary" aria-hidden /> Übernommen: {result.articles} Artikel, {result.members} Mitglieder
          {result.bookings > 0 && `, ${result.bookings} Buchungen und Zahlungen`}
          {result.stockLines > 0 && `, Bestand für ${result.stockLines} Artikel`}.
        </p>
        <p className="text-muted-foreground">Bitte einmal unter Artikel, Mitglieder und Bestand nachsehen, ob alles stimmt.</p>
        <Link href="/verwaltung/einrichtung?schritt=5" className="text-primary underline">
          Weiter mit der Einrichtung
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(async () => {
          try {
            const res = await fetch("/api/sicherung", { method: "POST", body: data });
            setResult((await res.json()) as Result);
            if (res.ok) router.refresh();
          } catch {
            setResult({ ok: false, error: "Hochladen hat nicht geklappt – ist die Datei zu groß? (bei Vercel höchstens etwa 4 MB)" });
          }
        });
      }}
    >
      <Input type="file" name="datei" aria-label="Sicherungsdatei" required className="h-11" />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-semibold">Was übernehmen?</legend>
        <Choice
          checked={mode === "stammdaten"}
          onChange={() => setMode("stammdaten")}
          value="stammdaten"
          title="Stammdaten + aktueller Bestand"
          text="Einstellungen, Logo, Artikel, Mitglieder samt ihren Links (die QR-Karten gelten weiter) und der Bestand mit seinem Einkaufswert – ohne alte Buchungen. Für einen Neustart, z. B. nach einer Testphase."
        />
        <Choice
          checked={mode === "alles"}
          onChange={() => setMode("alles")}
          value="alles"
          title="Alles"
          text="Zusätzlich alle Abende, Buchungen, Zahlungen, Einkäufe, Kasse und Inventuren – zum Umziehen zu einem anderen Anbieter."
        />
      </fieldset>
      <FormError message={result && !result.ok ? result.error : undefined} />
      <Button type="submit" size="lg" className="self-start" disabled={pending}>
        <Upload /> {pending ? "Wird übernommen …" : "Übernehmen"}
      </Button>
    </form>
  );
}

function Choice({ checked, onChange, value, title, text }: { checked: boolean; onChange: () => void; value: string; title: string; text: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3 has-checked:border-primary has-checked:bg-primary/5">
      <input type="radio" name="art" value={value} checked={checked} onChange={onChange} className="mt-1 size-4 accent-primary" />
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="text-sm text-muted-foreground">{text}</span>
      </span>
    </label>
  );
}
