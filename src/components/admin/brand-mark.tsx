import { Beer } from "lucide-react";

export type Brand = { clubName: string; logoUrl: string | null };

/** Logo und Vereinsname in der Kopf- bzw. Seitenleiste der Verwaltung. */
export function BrandMark({ clubName, logoUrl }: Brand) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className={`grid size-10 shrink-0 place-items-center overflow-hidden rounded-[11px] shadow-soft ${logoUrl ? "bg-white" : "bg-primary text-primary-foreground"}`}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- eigenes, kleines Logo aus der Datenbank
          <img src={logoUrl} alt="" className="size-full object-cover" />
        ) : (
          <Beer className="size-5" aria-hidden />
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-heading text-lg leading-tight font-bold">{clubName}</span>
        <span className="block text-sm text-muted-foreground">Verwaltung</span>
      </span>
    </div>
  );
}
