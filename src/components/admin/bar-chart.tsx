import type { SeriesPoint } from "@/domain/report";
import { formatCents } from "@/lib/money";

/**
 * Einfaches Säulendiagramm (SVG, ohne Bibliothek): Umsatz und Rohgewinn je Abend bzw. Monat.
 * Skaliert mit der Breite, bleibt beim Drucken scharf.
 */
export function RevenueChart({ points }: { points: SeriesPoint[] }) {
  if (points.length === 0) return <p className="text-muted-foreground">Keine Abende in diesem Zeitraum.</p>;
  const W = 800;
  const H = 260;
  const pad = { top: 16, right: 8, bottom: 28, left: 8 };
  const max = Math.max(...points.map((p) => Math.max(p.revenueCents, p.profitCents)), 1);
  const min = Math.min(...points.map((p) => p.profitCents), 0);
  const range = max - min;
  const innerH = H - pad.top - pad.bottom;
  const y = (v: number) => pad.top + ((max - v) / range) * innerH;
  const slot = (W - pad.left - pad.right) / points.length;
  const bar = Math.min(slot * 0.36, 28);
  // Beschriftung nur jede n-te Säule, damit nichts überlappt
  const every = Math.ceil(points.length / 16);

  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Umsatz und Rohgewinn">
        <line x1={pad.left} x2={W - pad.right} y1={y(0)} y2={y(0)} className="stroke-border" />
        {points.map((p, i) => {
          const cx = pad.left + slot * i + slot / 2;
          return (
            <g key={p.key}>
              <title>{`${p.label}: Umsatz ${formatCents(p.revenueCents)}, Rohgewinn ${formatCents(p.profitCents)}`}</title>
              <rect x={cx - bar} y={y(Math.max(p.revenueCents, 0))} width={bar} height={Math.abs(y(p.revenueCents) - y(0))} rx={3} className="fill-primary" />
              <rect
                x={cx}
                y={y(Math.max(p.profitCents, 0))}
                width={bar}
                height={Math.abs(y(p.profitCents) - y(0))}
                rx={3}
                className={p.profitCents < 0 ? "fill-destructive" : "fill-highlight"}
              />
              {i % every === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[13px]">
                  {p.label}
                </text>
              )}
            </g>
          );
        })}
        <text x={pad.left} y={pad.top - 4} className="fill-muted-foreground text-[12px]">
          {formatCents(max)}
        </text>
      </svg>
      <figcaption className="flex gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" /> Umsatz
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-highlight" /> Rohgewinn
        </span>
      </figcaption>
    </figure>
  );
}

/** Anteile als waagerechte Balken (z. B. Umsatz je Kategorie). */
export function ShareBars({ items }: { items: { label: string; cents: number }[] }) {
  const total = items.reduce((s, i) => s + Math.max(i.cents, 0), 0);
  if (total === 0) return <p className="text-muted-foreground">Kein Umsatz.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => {
        const share = Math.max(i.cents, 0) / total;
        return (
          <li key={i.label} className="flex flex-col gap-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{i.label}</span>
              <span className="tabular-nums">
                {formatCents(i.cents)} · {Math.round(share * 100)} %
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${share * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
