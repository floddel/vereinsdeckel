import { Heart } from "lucide-react";
import Link from "next/link";
import { ABOUT } from "@/lib/about";

/** Fußzeile der Verwaltung: Namensnennung (AGPL § 7 b) und Weg zum Unterstützen. */
export function AdminFooter() {
  return (
    <footer data-testid="vereinsdeckel-fusszeile" className="mt-10 border-t pt-4 text-sm text-muted-foreground print:hidden">
      <Link href="/verwaltung/ueber" className="hover:text-foreground">
        {ABOUT.name} – von {ABOUT.author} · Version {ABOUT.version} ·{" "}
        <span className="inline-flex items-center gap-1 text-highlight">
          <Heart className="size-3.5" aria-hidden /> Unterstützen
        </span>
      </Link>
    </footer>
  );
}
