import type { Metadata } from "next";
import { MemberTheme } from "@/components/theme-switch";
import { fontCoaster, fontReceipt } from "@/fonts";
import { cn } from "@/lib/utils";

/**
 * Für alle Mitgliederseiten (auch Bestellen, Kassenzettel, Übersicht): „Zum Home-Bildschirm“
 * legt das persönliche App-Symbol an – es öffnet immer den eigenen Bierdeckel, nie die Theke.
 */
export async function generateMetadata({ params }: LayoutProps<"/m/[token]">): Promise<Metadata> {
  const { token } = await params;
  return {
    manifest: `/m/${encodeURIComponent(token)}/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "Bierdeckel", statusBarStyle: "default" },
  };
}

/** Mitgliederansicht (Handy): eigene Schriften für Bierdeckel und Kassenzettel nur hier laden. */
export default function MemberLayout({ children }: LayoutProps<"/m/[token]">) {
  return (
    <div className={cn(fontCoaster.variable, fontReceipt.variable, "mx-auto flex w-full max-w-md flex-1 flex-col px-4 py-6")}>
      {children}
      {/* Hell ist Standard; jedes Mitglied kann für sein Handy Dunkel wählen */}
      <div className="mt-auto flex justify-center pt-8">
        <MemberTheme toggle />
      </div>
    </div>
  );
}
