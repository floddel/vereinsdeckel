import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Natives Auswahlfeld (funktioniert ohne JavaScript und mit der Tablet-Auswahlliste),
 * aber im Stil der übrigen Eingabefelder – auch in Safari.
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <span className={cn("relative inline-flex", className)}>
      <select
        {...props}
        className="h-full w-full appearance-none rounded-xl border border-transparent bg-secondary py-1 pr-9 pl-3 text-base outline-none md:text-sm focus-visible:border-ring focus-visible:bg-card focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
    </span>
  );
}
