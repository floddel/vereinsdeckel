import { useId } from "react";
import type { CoasterGroup } from "@/domain/member-view";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { TallyStrokes } from "./tally-strokes";

/** Feste Zahl je Strich-Gruppe: gleiche Gruppe → gleiche „Handschrift“, egal an welcher Stelle. */
const seedOf = (key: string) => [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

/**
 * Der Bierdeckel: runder Pappdeckel mit Druckring in der Vereinsfarbe, Vereinsname im Kreis, Kuli-Striche,
 * Beschriftung in Shantell Sans (font-coaster, wird nur in der Mitgliederansicht geladen).
 */
export function Coaster({
  clubName,
  groups,
  totalCents,
  settled,
  page,
  newFrom,
  className,
}: {
  clubName: string;
  groups: CoasterGroup[];
  /** Betrag nur auf dem letzten Deckel */
  totalCents?: number;
  settled?: boolean;
  /** z. B. "1/2", wenn es mehrere Deckel gibt */
  page?: string;
  /** je Strich-Gruppe: ab welchem Strich neu (wird gezeichnet) */
  newFrom?: Record<string, number>;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      className={cn("relative aspect-square w-80 shrink-0 rounded-full shadow-[0_14px_32px_-12px_rgb(60_40_10/0.5)]", className)}
    >
      {/* Pappe mit Faser und Kante, Druckring in der Vereinsfarbe (--print), blasser Glasrand-Abdruck */}
      <svg viewBox="0 0 320 320" className="absolute inset-0 overflow-visible" aria-hidden>
        <defs>
          <radialGradient id={`${id}-pappe`} cx="0.38" cy="0.32" r="0.8">
            <stop offset="0" stopColor="#fcf8ee" />
            <stop offset="0.7" stopColor="#f3ead6" />
            <stop offset="1" stopColor="#e9dcc0" />
          </radialGradient>
          <filter id={`${id}-faser`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={4} result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 .42  0 0 0 0 .32  0 0 0 0 .17  0 0 0 .28 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <path id={`${id}-oben`} d="M 27 160 A 133 133 0 0 1 293 160" />
          <path id={`${id}-unten`} d="M 14 160 A 146 146 0 0 0 306 160" />
        </defs>
        <circle cx="160" cy="164" r="157" fill="#b9a67f" />
        <circle cx="160" cy="160" r="157" fill={`url(#${id}-pappe)`} />
        <circle cx="160" cy="160" r="157" fill="#000" filter={`url(#${id}-faser)`} />
        <circle cx="160" cy="160" r="155.5" fill="none" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.2" />
        <circle cx="160" cy="160" r="140" fill="none" style={{ stroke: "var(--print)" }} strokeWidth="22" />
        <circle cx="160" cy="160" r="122" fill="none" style={{ stroke: "var(--print)" }} strokeWidth="1.6" />
        <circle cx="160" cy="160" r="115" fill="none" style={{ stroke: "var(--print)" }} strokeWidth="1.4" strokeDasharray="1 5" strokeLinecap="round" opacity="0.7" />
        <text className="font-heading" fill="#fff" fontSize="15" fontWeight="800" letterSpacing="3">
          <textPath href={`#${id}-oben`} startOffset="50%" textAnchor="middle">
            {clubName.toUpperCase()}
          </textPath>
        </text>
        <text className="font-heading" fill="#fff" fontSize="11" fontWeight="700" letterSpacing="2.6">
          <textPath href={`#${id}-unten`} startOffset="50%" textAnchor="middle">
            ★ DEIN BIERDECKEL{page ? ` · ${page}` : ""} ★
          </textPath>
        </text>
        <circle cx="210" cy="212" r="50" fill="none" stroke="#9a6e22" strokeOpacity="0.13" strokeWidth="6" strokeDasharray="200 28 74 32" />
        <circle cx="210" cy="212" r="45.5" fill="none" stroke="#9a6e22" strokeOpacity="0.08" strokeWidth="2" />
      </svg>
      {/* Inhalt etwas nach oben gerückt: unten steht „Dein Bierdeckel“ im Rand */}
      <div className="absolute top-[19%] right-[20%] bottom-[23%] left-[20%] flex -rotate-3 flex-col items-center justify-center gap-1 font-coaster text-[#22408f]">
        {settled ? (
          <>
            <span className="-rotate-12 rounded-md border-4 border-[#c2410c]/80 px-3 py-1 font-heading text-2xl font-black tracking-widest text-[#c2410c]/85">
              BEGLICHEN
            </span>
            <span className="mt-2 text-3xl font-bold">Prost!</span>
          </>
        ) : (
          <>
            <div className="mx-auto grid w-fit grid-cols-[auto_auto] items-center gap-x-2 gap-y-1">
              {groups.map((g) => (
                <div key={g.key} className="contents">
                  <span className="text-right text-lg leading-none font-semibold">
                    {g.label}
                    {g.guests ? <span className="block text-xs opacity-75">davon {g.guests} Gast</span> : null}
                  </span>
                  <TallyStrokes
                    count={g.count}
                    perRow={3}
                    seed={seedOf(g.key)}
                    label={g.label}
                    newFrom={newFrom?.[g.key]}
                    className="max-w-full"
                  />
                </div>
              ))}
            </div>
            {totalCents !== undefined && (
              <span
                className="mt-1 text-3xl leading-none font-bold underline decoration-double decoration-2 underline-offset-4"
                data-testid="deckel-betrag"
              >
                {formatCents(totalCents)}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
