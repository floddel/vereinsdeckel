import type { CSSProperties, ReactNode } from "react";

/**
 * Farbige Symbole der Verwaltung (Entwurf C, „wie die Artikel-Bilder“): zweifarbig gefüllt,
 * mit Lichtpunkt und weichem Schatten. Teile: Hauptform, hellere Zweitform, Aussparung, Glanz.
 */
const P: CSSProperties = { fill: "var(--ai-p)" };
const S: CSSProperties = { fill: "var(--ai-s)" };
const CUT: CSSProperties = { fill: "#fff" };
const HL: CSSProperties = { fill: "rgb(255 255 255 / 0.4)" };

const GLYPHS = {
  uebersicht: (
    <>
      <rect style={P} x="3" y="3" width="8" height="10" rx="2.2" />
      <rect style={S} x="13" y="3" width="8" height="6" rx="2.2" />
      <rect style={S} x="3" y="15" width="8" height="6" rx="2.2" />
      <rect style={P} x="13" y="11" width="8" height="10" rx="2.2" />
      <rect style={HL} x="4" y="4" width="6" height="2.5" rx="1.2" />
    </>
  ),
  heute: (
    <>
      <circle style={P} cx="8" cy="9.5" r="3.7" />
      <circle style={P} cx="12" cy="7.2" r="4.4" />
      <circle style={P} cx="16" cy="9.5" r="3.7" />
      <rect style={P} x="6.6" y="9.5" width="10.8" height="6" rx="1" />
      <rect style={S} x="6.6" y="16.5" width="10.8" height="4.5" rx="1.6" />
      <ellipse style={HL} cx="11" cy="5.6" rx="2.6" ry="1.3" />
    </>
  ),
  artikel: (
    <>
      <path style={S} d="M15 9.5h2.6A2.9 2.9 0 0 1 20.5 12.4v3.2a2.9 2.9 0 0 1-2.9 2.9H15v-2.2h2.4a.9.9 0 0 0 .9-.9v-2.8a.9.9 0 0 0-.9-.9H15z" />
      <rect style={P} x="4.5" y="7.5" width="11" height="14" rx="2.6" />
      <circle style={S} cx="6.6" cy="7.2" r="2.4" />
      <circle style={S} cx="10" cy="5.6" r="2.9" />
      <circle style={S} cx="13.4" cy="7.2" r="2.4" />
      <rect style={CUT} x="7.4" y="11" width="1.6" height="7.5" rx=".8" opacity=".55" />
      <rect style={CUT} x="11" y="11" width="1.6" height="7.5" rx=".8" opacity=".55" />
    </>
  ),
  mitglieder: (
    <>
      <circle style={S} cx="16.8" cy="8.6" r="2.9" />
      <path style={S} d="M15.4 20.6h6.3v-.7a4.9 4.9 0 0 0-7.4-4.2 7.6 7.6 0 0 1 1.1 4.9z" />
      <circle style={P} cx="9" cy="7.8" r="3.7" />
      <path style={P} d="M2.3 20.6v-.6a6.7 6.7 0 0 1 13.4 0v.6z" />
      <ellipse style={HL} cx="8.2" cy="6.2" rx="1.8" ry="1" />
    </>
  ),
  abende: (
    <>
      <path style={S} d="M3 8.2A3.2 3.2 0 0 1 6.2 5h11.6A3.2 3.2 0 0 1 21 8.2V10H3z" />
      <path style={P} d="M3 11h18v6.8A3.2 3.2 0 0 1 17.8 21H6.2A3.2 3.2 0 0 1 3 17.8z" />
      <rect style={P} x="7" y="2.6" width="2.2" height="4.6" rx="1.1" />
      <rect style={P} x="14.8" y="2.6" width="2.2" height="4.6" rx="1.1" />
      <path style={CUT} d="M14.6 13.2a3.3 3.3 0 1 0 1.9 4.6 2.7 2.7 0 0 1-1.9-4.6z" />
      <circle style={CUT} cx="9" cy="14.6" r=".9" />
      <circle style={CUT} cx="11" cy="17.6" r=".7" />
    </>
  ),
  statistik: (
    <>
      <rect style={S} x="3.5" y="12.5" width="4.6" height="8.5" rx="1.6" />
      <rect style={P} x="9.7" y="5" width="4.6" height="16" rx="1.6" />
      <rect style={S} x="15.9" y="9" width="4.6" height="12" rx="1.6" />
      <rect style={HL} x="10.4" y="5.8" width="1.4" height="6" rx=".7" />
    </>
  ),
  einkaeufe: (
    <>
      <path style={P} d="M2 3.8h2.5c.5 0 .9.3 1 .8L5.9 6.5H20.6a1 1 0 0 1 1 1.2l-1.4 6.6a2.2 2.2 0 0 1-2.1 1.7H8.6l.3 1.4H19.2V19.4H8a1.2 1.2 0 0 1-1.2-.9L3.9 5.9H2z" />
      <path style={S} d="M8.4 8.6h4v5.4H9.6z M13.6 8.6h5.6l-1 5.4h-4.6z" opacity=".9" />
      <circle style={P} cx="9.4" cy="21" r="1.7" />
      <circle style={P} cx="17.6" cy="21" r="1.7" />
    </>
  ),
  kasse: (
    <>
      <path style={S} d="M5.5 7.5l9.4-3.8a1.6 1.6 0 0 1 2.2 1.5V7.5z" />
      <rect style={P} x="2.5" y="7" width="19" height="13.5" rx="3.2" />
      <rect style={S} x="14" y="11" width="7.5" height="5.5" rx="2.75" />
      <circle style={CUT} cx="17" cy="13.75" r="1.35" />
      <rect style={HL} x="4" y="8.3" width="9" height="1.6" rx=".8" />
    </>
  ),
  bestand: (
    <>
      <rect style={S} x="7.5" y="3" width="9" height="8" rx="1.6" />
      <rect style={P} x="2.5" y="12.5" width="9" height="8.5" rx="1.6" />
      <rect style={P} x="12.5" y="12.5" width="9" height="8.5" rx="1.6" />
      <rect style={CUT} x="5.6" y="12.5" width="2.8" height="3.2" opacity=".6" />
      <rect style={CUT} x="15.6" y="12.5" width="2.8" height="3.2" opacity=".6" />
      <rect style={CUT} x="10.6" y="3" width="2.8" height="3" opacity=".6" />
    </>
  ),
  datenschutz: (
    <>
      <path style={P} d="M12 2.4l7.8 3.1v6.1c0 4.8-3.3 8.7-7.8 10.4-4.5-1.7-7.8-5.6-7.8-10.4V5.5z" />
      <path style={S} d="M12 2.4l7.8 3.1v6.1c0 4.8-3.3 8.7-7.8 10.4z" opacity=".55" />
      <path style={CUT} d="M10.7 15.6l-3-3 1.4-1.4 1.6 1.6 4.2-4.2 1.4 1.4z" />
    </>
  ),
  einstellungen: (
    <>
      <g style={P}>
        {[0, 45].map((deg) => (
          <g key={deg} transform={`rotate(${deg} 12 12)`}>
            <rect x="10.4" y="1.8" width="3.2" height="5" rx="1" />
            <rect x="10.4" y="17.2" width="3.2" height="5" rx="1" />
            <rect x="1.8" y="10.4" width="5" height="3.2" rx="1" />
            <rect x="17.2" y="10.4" width="5" height="3.2" rx="1" />
          </g>
        ))}
        <circle cx="12" cy="12" r="7" />
      </g>
      <circle style={S} cx="12" cy="12" r="4.6" />
      <circle style={CUT} cx="12" cy="12" r="2.3" />
    </>
  ),
  sperren: (
    <>
      <path style={S} d="M7.5 11V8a4.5 4.5 0 0 1 9 0v3h-2.4V8a2.1 2.1 0 0 0-4.2 0v3z" />
      <rect style={P} x="4.5" y="10.5" width="15" height="11" rx="2.8" />
      <circle style={CUT} cx="12" cy="15.2" r="1.6" />
      <rect style={CUT} x="11.2" y="15.6" width="1.6" height="3.2" rx=".8" />
    </>
  ),
  abmelden: (
    <>
      <rect style={S} x="3" y="3" width="10.5" height="18" rx="2.4" />
      <path style={P} d="M14.5 7.4l6 4.6-6 4.6v-2.9H9v-3.4h5.5z" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type AdminIconName = keyof typeof GLYPHS;

/** Farbiges Verwaltungs-Symbol; `color` ist die Hauptfarbe (Apple-Systemfarbe). */
export function AdminIcon({ name, color, className }: { name: AdminIconName; color: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      style={{ "--ai-p": color, "--ai-s": `color-mix(in srgb, ${color} 55%, #fff)`, filter: "drop-shadow(0 1.5px 1.5px rgb(0 0 0 / 0.18))" } as CSSProperties}
    >
      {GLYPHS[name]}
    </svg>
  );
}
