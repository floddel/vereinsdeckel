"use client";

import { Beer, MenuIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useState } from "react";
import { AdminIcon, type AdminIconName } from "@/components/icons/admin-icons";
import { ThemeButton } from "@/components/theme-switch";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { clearOfflineData } from "@/lib/service-worker";
import { lockAction, logoutAction } from "@/server/auth-actions";

// Farbige Symbole (Apple-Systemfarben), gezeichnet in components/icons/admin-icons
const links: { href: string; label: string; icon: AdminIconName; color: string }[] = [
  { href: "/verwaltung", label: "Übersicht", icon: "uebersicht", color: "#007aff" },
  { href: "/verwaltung/heute", label: "Heute", icon: "heute", color: "#ff9500" },
  { href: "/verwaltung/artikel", label: "Artikel", icon: "artikel", color: "#c08a3e" },
  { href: "/verwaltung/mitglieder", label: "Mitglieder", icon: "mitglieder", color: "#ff2d55" },
  { href: "/verwaltung/abende", label: "Abende", icon: "abende", color: "#5856d6" },
  { href: "/verwaltung/statistik", label: "Statistik", icon: "statistik", color: "#af52de" },
  { href: "/verwaltung/einkaeufe", label: "Einkäufe", icon: "einkaeufe", color: "#30b0c7" },
  { href: "/verwaltung/kasse", label: "Kasse", icon: "kasse", color: "#34c759" },
  { href: "/verwaltung/bestand", label: "Bestand", icon: "bestand", color: "#d4a000" },
  { href: "/verwaltung/datenschutz", label: "Datenschutz", icon: "datenschutz", color: "#5e5ce6" },
  { href: "/verwaltung/einstellungen", label: "Einstellungen", icon: "einstellungen", color: "#8e8e93" },
];

/** Die aktuelle Adresse ist erst beim Seitenaufruf bekannt → in Suspense, vorher ohne Hervorhebung. */
function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<NavLinksView onNavigate={onNavigate} pathname="" />}>
      <ActiveNavLinks onNavigate={onNavigate} />
    </Suspense>
  );
}

function ActiveNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <NavLinksView onNavigate={onNavigate} pathname={usePathname()} />;
}

const item = "flex min-h-11 items-center gap-3 rounded-full px-2 text-[15px] font-medium hover:bg-secondary";

function NavLinksView({ onNavigate, pathname }: { onNavigate?: () => void; pathname: string }) {
  return (
    <nav className="flex flex-col gap-1">
      <Link
        href="/theke"
        onClick={onNavigate}
        className="mb-3 flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-4 font-semibold text-primary-foreground shadow-soft hover:bg-primary/90"
      >
        <Beer className="size-5" aria-hidden /> Zur Theke
      </Link>
      {links.map(({ href, label, icon, color }) => {
        const active = href === "/verwaltung" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(item, active && "bg-primary/12 font-semibold text-primary hover:bg-primary/16")}
          >
            <AdminIcon name={icon} color={color} className="size-7 shrink-0" />
            {label}
          </Link>
        );
      })}
      <div className="mt-3 flex flex-col gap-1 border-t pt-3">
        <form action={lockAction}>
          <button type="submit" className={cn(item, "w-full")}>
            <AdminIcon name="sperren" color="#8e8e93" className="size-7 shrink-0" />
            Verwaltung sperren
          </button>
        </form>
        <form action={logoutAction} onSubmit={clearOfflineData}>
          <button type="submit" className={cn(item, "w-full text-muted-foreground")}>
            <AdminIcon name="abmelden" color="#8e8e93" className="size-7 shrink-0" />
            Abmelden
          </button>
        </form>
      </div>
    </nav>
  );
}

/** Schwebende Glas-Seitenleiste (Desktop) bzw. Glas-Kopfleiste mit Menü-Knopf (Tablet und kleiner). */
export function AdminNav({ brand }: { brand: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="glass sticky top-3 m-3 mr-0 hidden h-[calc(100dvh-1.5rem)] w-64 shrink-0 flex-col gap-5 overflow-y-auto rounded-[28px] p-3 lg:flex print:hidden">
        <div className="flex items-center gap-1 pl-1">
          <div className="min-w-0 flex-1">{brand}</div>
          <ThemeButton className="size-10 [&_svg]:size-5" />
        </div>
        <NavLinks />
      </aside>
      <header className="glass sticky top-2 z-10 mx-2 mt-2 flex items-center gap-2 rounded-full py-1.5 pr-1.5 pl-1.5 md:mx-3 lg:hidden print:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Menü öffnen"
                className="rounded-full text-primary hover:bg-secondary hover:text-primary"
              />
            }
          >
            <MenuIcon />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-5 overflow-y-auto border-none p-3">
            <SheetHeader className="p-0">
              <SheetTitle className="sr-only">Menü</SheetTitle>
              {brand}
            </SheetHeader>
            <NavLinks onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="min-w-0 flex-1">{brand}</div>
        <ThemeButton className="size-10 [&_svg]:size-5" />
      </header>
    </>
  );
}
