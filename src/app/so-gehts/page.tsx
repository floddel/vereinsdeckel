import { Camera, HandHeart, House, KeyRound, ListChecks, MessageCircleQuestion, ReceiptText, Smartphone, Soup } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { MemberTheme } from "@/components/theme-switch";

export const metadata: Metadata = { title: "So geht's – dein Bierdeckel aufs Handy" };

/**
 * Erklärung für Mitglieder (öffentlich, verlinkt von der Karte am Tresen): einfach, große Schrift,
 * und ganz deutlich: alles freiwillig.
 */
export default function SoGehtsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pt-6 pb-12 text-lg leading-relaxed">
      <MemberTheme />
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Dein Bierdeckel aufs Handy</h1>
        <p className="text-muted-foreground">Ganz einfach erklärt – in drei Schritten.</p>
      </header>

      <Box icon={HandHeart} title="Erst das Wichtigste" highlight>
        <p>
          <strong>Das Handy ist freiwillig.</strong> Bestellen, Anschreiben und Bezahlen geht wie immer vorne an der Theke – dort bist du
          jederzeit herzlich willkommen. Die App ist nur eine kleine Erleichterung für alle, die mögen.
        </p>
      </Box>

      <ol className="flex flex-col gap-5">
        <Step n={1} icon={KeyRound} title="Karte vorne am Tresen holen">
          Frag einfach vorne nach. Du bekommst eine kleine Karte mit <strong>deinem persönlichen QR-Code</strong> – das ist ein
          quadratisches Muster aus Punkten.
        </Step>
        <Step n={2} icon={Camera} title="Mit der Handy-Kamera scannen">
          Öffne die <strong>Kamera</strong> deines Handys und halte sie auf den QR-Code. Oben erscheint ein Hinweis oder ein Link – darauf
          tippen. Schon siehst du deinen Bierdeckel.
        </Step>
        <Step n={3} icon={House} title="Auf den Startbildschirm legen">
          Dann ist er immer mit einem Tipp da:
          <ul className="mt-2 flex flex-col gap-2">
            <li>
              <strong>iPhone:</strong> unten auf das Teilen-Symbol (Viereck mit Pfeil nach oben) → „Zum Home-Bildschirm“.
            </li>
            <li>
              <strong>Android:</strong> oben rechts auf die drei Punkte ⋮ → „Zum Startbildschirm hinzufügen“.
            </li>
          </ul>
          Klappt nicht? Kein Problem – vorne helfen wir gern.
        </Step>
      </ol>

      <Box icon={ListChecks} title="Was du damit siehst">
        <ul className="flex flex-col gap-3">
          <Item icon={Smartphone}>Was gerade auf deinem Deckel steht – mit Strichen wie auf dem echten Bierdeckel.</Item>
          <Item icon={ReceiptText}>Deine Kassenzettel der letzten Abende.</Item>
          <Item icon={Soup}>Wenn die Küche offen ist: Essen bestellen, ohne aufzustehen.</Item>
        </ul>
      </Box>

      <Box icon={KeyRound} title="Dein Link gehört nur dir">
        <p>
          Der QR-Code ist wie ein Schlüssel zu <strong>deinem</strong> Deckel – bitte nicht weitergeben. Karte verloren? Sag vorne Bescheid,
          dann wird der alte Code gesperrt und du bekommst einen neuen.
        </p>
      </Box>

      <Box icon={MessageCircleQuestion} title="Fragen?">
        <p>Einfach vorne am Tresen fragen – wir zeigen es dir gern in Ruhe.</p>
      </Box>

      <Link href="/karte" className="w-fit rounded-full bg-primary px-5 py-2.5 font-semibold text-primary-foreground">
        ← Was gibt&apos;s heute?
      </Link>
      <Link href="/datenschutz" prefetch={false} className="text-sm text-muted-foreground underline underline-offset-4">
        Datenschutz
      </Link>
    </main>
  );
}

type Icon = typeof HandHeart;

function Box({ icon: I, title, highlight, children }: { icon: Icon; title: string; highlight?: boolean; children: ReactNode }) {
  return (
    <section className={highlight ? "rounded-3xl bg-highlight p-5 text-highlight-foreground shadow-soft" : "rounded-3xl bg-card p-5 shadow-soft dark:ring-1 dark:ring-white/5"}>
      <h2 className="mb-2 flex items-center gap-2 text-xl font-bold">
        <I className="size-6 shrink-0" aria-hidden /> {title}
      </h2>
      {children}
    </section>
  );
}

function Step({ n, icon: I, title, children }: { n: number; icon: Icon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4 rounded-3xl bg-card p-5 shadow-soft dark:ring-1 dark:ring-white/5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-2xl font-extrabold text-primary-foreground">{n}</span>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <I className="size-5 shrink-0 text-primary" aria-hidden /> {title}
        </h2>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}

function Item({ icon: I, children }: { icon: Icon; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <I className="mt-1 size-5 shrink-0 text-primary" aria-hidden />
      <span>{children}</span>
    </li>
  );
}
