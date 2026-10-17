"use client";

import { Check, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { applyStarterArticlesAction, finishSetupAction } from "@/server/setup-actions";

/** Schritte oben (zum Springen) bzw. „Zurück / Weiter“ unten. */
export function StepNav({ steps, step, bottom = false }: { steps: string[]; step: number; bottom?: boolean }) {
  const href = (n: number) => `/verwaltung/einrichtung?schritt=${n}`;
  if (bottom) {
    return (
      <div className="flex justify-between gap-2">
        {step > 1 ? (
          <Button nativeButton={false} variant="outline" size="lg" render={<Link href={href(step - 1)} />}>
            <ChevronLeft /> Zurück
          </Button>
        ) : (
          <span />
        )}
        {step < steps.length && (
          <Button nativeButton={false} size="lg" render={<Link href={href(step + 1)} />}>
            Weiter <ChevronRight />
          </Button>
        )}
      </div>
    );
  }
  return (
    <nav aria-label="Schritte der Einrichtung">
      <ol className="flex flex-wrap gap-2">
        {steps.map((label, i) => {
          const n = i + 1;
          return (
            <li key={label}>
              <Link
                href={href(n)}
                aria-current={n === step ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium",
                  n === step ? "border-primary bg-primary text-primary-foreground" : n < step ? "bg-secondary" : "bg-card hover:bg-muted",
                )}
              >
                <span className="tabular-nums">{n < step ? <Check className="size-4" aria-hidden /> : n}</span>
                {label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function StarterArticlesButton({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="lg"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const r = await applyStarterArticlesAction();
          if (r.ok) toast.success(r.message ?? "Angelegt");
          else toast.error(r.error ?? "Nicht möglich");
        })
      }
    >
      <Sparkles /> Startvorlage übernehmen
    </Button>
  );
}

export function FinishButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="lg"
      className="self-start"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const r = await finishSetupAction();
          if (r.ok) {
            toast.success(r.message ?? "Fertig");
            router.push("/verwaltung");
          }
        })
      }
    >
      <Check /> Einrichtung abschließen
    </Button>
  );
}
