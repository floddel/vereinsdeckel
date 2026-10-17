import { HandHeart, Smartphone, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ArticleIcon } from "@/components/article-icon";
import { getDb } from "@/db/client";
import { FEW_LEFT, type MenuItem } from "@/domain/menu";
import { formatBusinessDay } from "@/lib/date";
import { formatCents } from "@/lib/money";
import { getPublicMenu } from "@/server/menu";
import { MemberTheme } from "@/components/theme-switch";

export const metadata: Metadata = { title: "Heute an der Theke" };

/**
 * Öffentliche Karte (QR-Aufsteller am Tresen): was es gerade gibt, mit aktuellen Preisen.
 * Nur Artikel und Preise – keine persönlichen Daten, keine Anmeldung.
 */
export default function KartePage() {
  return (
    <Suspense fallback={<p className="p-6 text-muted-foreground">Lädt …</p>}>
      <Karte />
    </Suspense>
  );
}

async function Karte() {
  await connection();
  const menu = await getPublicMenu(getDb());
  const empty = menu.specials.length === 0 && menu.sections.length === 0;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pt-4 pb-10">
      <MemberTheme />
      <header className="flex items-center gap-3">
        {menu.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={menu.logoUrl} alt="" className="size-12 rounded-full bg-white object-cover shadow-soft" />
        )}
        <div>
          <h1 className="text-[2rem] leading-tight font-bold">Was gibt&apos;s heute?</h1>
          <p className="text-base text-muted-foreground">
            {menu.clubName} · {formatBusinessDay(menu.today)}
          </p>
        </div>
      </header>

      {menu.sections.length > 1 && (
        <nav aria-label="Zur Gruppe springen" className="glass sticky top-2 z-10 flex gap-1 overflow-x-auto rounded-full p-1">
          {menu.specials.length > 0 && <Chip href="#frisch">Frisch gekocht</Chip>}
          {menu.sections.map((s) => (
            <Chip key={s.id} href={`#${s.id}`}>
              {s.title}
            </Chip>
          ))}
        </nav>
      )}

      {menu.specials.length > 0 && (
        <div id="frisch" className="flex scroll-mt-20 flex-col gap-3">
          {menu.specials.map((d) => (
            <Special key={d.id} item={d} />
          ))}
        </div>
      )}

      {menu.tip && (
        <section
          data-testid="tipp-des-hauses"
          className="flex items-center gap-4 rounded-[22px] bg-card p-4 shadow-soft"
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#ff9500] text-white" aria-hidden>
            <Sparkles className="size-7" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-highlight">Tipp des Hauses</p>
            <p className="text-xl leading-tight font-bold">
              {menu.tip.item.name} · {formatCents(menu.tip.item.priceCents)}
            </p>
            {menu.tip.text && <p className="text-base text-muted-foreground">{menu.tip.text}</p>}
          </div>
        </section>
      )}

      {menu.sections.map((s) => (
        <section key={s.id} id={s.id} data-testid={`gruppe-${s.id}`} className="scroll-mt-20">
          <h2 className="mb-3 text-xl font-bold">{s.title}</h2>
          <ul className="grid grid-cols-2 gap-3">
            {s.items.map((i) => (
              <Tile key={i.id} item={i} />
            ))}
          </ul>
        </section>
      ))}

      {empty && <p className="rounded-[22px] bg-card p-6 text-center text-lg shadow-soft">Gerade steht nichts auf der Karte – frag einfach vorne am Tresen.</p>}

      <section className="flex flex-col gap-3 rounded-[22px] bg-card p-5 shadow-soft">
        <p className="flex items-center gap-2 text-lg font-bold">
          <Smartphone className="size-6 shrink-0" aria-hidden /> Dein Bierdeckel aufs Handy
        </p>
        <p className="text-base leading-relaxed">
          Sieh jederzeit, was auf deinem Deckel steht – und bestell Essen, wenn die Küche offen ist. Deinen persönlichen QR-Code bekommst du{" "}
          <strong>vorne am Tresen</strong>.
        </p>
        <p className="flex items-start gap-2 rounded-2xl bg-muted p-3 text-base">
          <HandHeart className="mt-0.5 size-5 shrink-0" aria-hidden />
          Alles freiwillig – vorne an der Theke bist du wie immer herzlich willkommen.
        </p>
        <Link href="/so-gehts" className="w-fit rounded-full bg-primary px-5 py-2.5 text-base font-semibold text-primary-foreground">
          So funktioniert&apos;s →
        </Link>
      </section>
      <Link href="/datenschutz" prefetch={false} className="text-center text-sm text-muted-foreground underline underline-offset-4">
        Datenschutz
      </Link>
    </main>
  );
}

function Special({ item: d }: { item: MenuItem }) {
  return (
    // Wie eine Karte im App Store: großes Symbol, Hinweis, Name, Preis als Pille
    <section data-testid="frisch-gekocht" className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-0.5 rounded-[22px] bg-card p-4 shadow-soft">
      <ArticleIcon icon={d.icon} className="row-span-3 size-16" />
      <p className="text-[13px] font-semibold text-highlight">Heute frisch gekocht</p>
      <p className="text-2xl leading-tight font-bold">{d.name}</p>
      {d.description ? <p className="text-base text-muted-foreground">{d.description}</p> : <span />}
      <p className="col-span-2 mt-3 w-fit rounded-full bg-secondary px-4 py-1.5 text-lg font-bold text-primary tabular-nums">{formatCents(d.priceCents)}</p>
    </section>
  );
}

function Chip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} className="shrink-0 rounded-full px-4 py-2 text-[15px] font-semibold hover:bg-secondary">
      {children}
    </a>
  );
}

function Tile({ item: i }: { item: MenuItem }) {
  return (
    <li className="flex flex-col items-center gap-1.5 rounded-[22px] bg-card p-4 text-center shadow-soft">
      <span className="flex size-14 items-center justify-center">
        <ArticleIcon icon={i.icon} className="size-13" />
      </span>
      <span className="text-base leading-tight font-semibold">{i.name}</span>
      {i.description && <span className="text-sm leading-snug text-muted-foreground">{i.description}</span>}
      <span className="text-lg font-extrabold tabular-nums">{formatCents(i.priceCents)}</span>
      {i.left !== null && i.left <= FEW_LEFT && (
        <span className="rounded-full bg-highlight/15 px-2 text-sm font-semibold text-highlight">nur noch {i.left}</span>
      )}
    </li>
  );
}
