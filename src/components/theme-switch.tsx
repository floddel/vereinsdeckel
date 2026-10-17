"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { GLASS_DEFAULT, readGlass, readMemberTheme, readTheme, setGlass, setTheme, subscribeTheme, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "Automatisch", Icon: Monitor },
  { value: "light", label: "Hell", Icon: Sun },
  { value: "dark", label: "Dunkel", Icon: Moon },
];

function useTheme() {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "system" as const);
}

/** Segmentschalter Automatisch / Hell / Dunkel (z. B. in den Einstellungen). */
export function ThemeSwitch({ className }: { className?: string }) {
  const theme = useTheme();
  return (
    <div role="radiogroup" aria-label="Darstellung" className={cn("inline-grid grid-cols-3 gap-0.5 rounded-full bg-secondary p-1", className)}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold text-muted-foreground transition",
            theme === value && "bg-card text-foreground shadow-soft",
          )}
        >
          <Icon className="size-4" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}

/** Runder Knopf für Kopfleisten: wechselt Automatisch → Hell → Dunkel. */
export function ThemeButton({ className }: { className?: string }) {
  const theme = useTheme();
  const i = OPTIONS.findIndex((o) => o.value === theme);
  const { Icon, label } = OPTIONS[i];
  const next = OPTIONS[(i + 1) % OPTIONS.length];
  return (
    <button
      type="button"
      onClick={() => setTheme(next.value)}
      aria-label={`Darstellung: ${label} – tippen für ${next.label}`}
      title={`Darstellung: ${label}`}
      className={cn("grid size-12 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground", className)}
    >
      <Icon className="size-6" aria-hidden />
    </button>
  );
}

/** Schieberegler für die Glas-Stärke: klar … milchig (gilt nur für dieses Gerät). */
export function GlassSlider() {
  const glass = useSyncExternalStore(subscribeTheme, readGlass, () => GLASS_DEFAULT);
  return (
    <div className="flex max-w-md flex-col gap-2">
      <label htmlFor="glas-staerke" className="text-sm font-semibold">
        Glas
      </label>
      <input
        id="glas-staerke"
        type="range"
        min={0}
        max={100}
        step={5}
        value={glass}
        onChange={(e) => setGlass(Number(e.target.value))}
        aria-valuetext={`${glass} %`}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-sm text-muted-foreground" aria-hidden>
        <span>klar</span>
        <span>milchig</span>
      </div>
    </div>
  );
}

/**
 * Für Mitgliederseiten: ohne eigene Wahl hell (auch nach Wechsel innerhalb der App, nicht nur beim Laden).
 * Mit `toggle` zusätzlich ein einfacher Schalter Hell / Dunkel – groß und beschriftet für ältere Mitglieder.
 */
export function MemberTheme({ toggle = false }: { toggle?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, readMemberTheme, () => "light" as const);
  useEffect(() => {
    const d = document.documentElement;
    if (readTheme() !== "system") return;
    d.dataset.theme = "light";
    return () => {
      if (readTheme() === "system") delete d.dataset.theme;
    };
  }, []);
  if (!toggle) return null;
  return (
    <div role="radiogroup" aria-label="Darstellung" className="inline-grid grid-cols-2 gap-0.5 self-center rounded-full bg-secondary p-1">
      {OPTIONS.filter((o) => o.value !== "system").map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex h-10 items-center justify-center gap-2 rounded-full px-5 text-[15px] font-semibold text-muted-foreground transition",
            theme === value && "bg-card text-foreground shadow-soft",
          )}
        >
          <Icon className="size-4" aria-hidden /> {label}
        </button>
      ))}
    </div>
  );
}
