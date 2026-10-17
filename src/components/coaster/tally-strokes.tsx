import { tallyBlocks } from "@/domain/tally";

/** Feste „Zufalls“-Folge (mulberry32): gleicher Deckel sieht auf Server und Handy gleich aus. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const H = 22; // Strichhöhe
const STEP = 6.5; // Abstand der Striche im Block
const BLOCK = 26; // Breite eines Fünferblocks
const GAP = 10; // Abstand zwischen Blöcken
const ROW = 32; // Zeilenhöhe

/**
 * Strichliste wie auf dem Bierdeckel, mit dem Kuli: Fünferblöcke (4 Striche + Querstrich), Rest einzeln.
 * perRow: Blöcke je Zeile, danach geht es in der nächsten Zeile weiter.
 * newFrom: Striche ab dieser Nummer sind neu und werden „gezeichnet“ (Animation).
 */
export function TallyStrokes({
  count,
  perRow = 5,
  seed = 1,
  className,
  label,
  newFrom,
}: {
  count: number;
  perRow?: number;
  seed?: number;
  className?: string;
  label: string;
  newFrom?: number;
}) {
  const { blocks, rest } = tallyBlocks(count);
  const units = blocks + (rest ? 1 : 0);
  const rows = Math.max(1, Math.ceil(units / perRow));
  const width = Math.min(units, perRow) * (BLOCK + GAP) - GAP + 4;
  const height = rows * ROW - (ROW - H) + 6;

  const strokes: React.ReactNode[] = [];
  const add = (no: number, x1: number, y1: number, x2: number, y2: number) => {
    // Zitter je Strich-Position: Kommt ein Strich dazu, bleiben die alten unverändert.
    const rnd = random(seed * 7919 + no * 31);
    const j = (amount: number) => (rnd() - 0.5) * 2 * amount;
    const [ax, ay, bx, by] = [x1 + j(0.8), y1 + j(1.3), x2 + j(1), y2 + j(1.4)];
    const mx = (ax + bx) / 2 + j(1.2);
    const my = (ay + by) / 2 + j(0.8);
    const isNew = newFrom !== undefined && no >= newFrom;
    strokes.push(
      <path
        key={no}
        d={`M${ax.toFixed(2)} ${ay.toFixed(2)}Q${mx.toFixed(2)} ${my.toFixed(2)} ${bx.toFixed(2)} ${by.toFixed(2)}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        className={isNew ? "tally-new" : undefined}
        // neue Striche nacheinander zeichnen
        style={isNew ? { animationDelay: `${(no - newFrom) * 0.25}s` } : undefined}
      />,
    );
  };

  for (let u = 0; u < units; u++) {
    const x0 = (u % perRow) * (BLOCK + GAP) + 2;
    const y0 = Math.floor(u / perRow) * ROW + 3;
    const n = u < blocks ? 4 : rest;
    for (let i = 0; i < n; i++) add(u * 5 + i, x0 + 2 + i * STEP, y0, x0 + 2 + i * STEP, y0 + H);
    if (u < blocks) add(u * 5 + 4, x0 - 1, y0 + H - 5, x0 + BLOCK - 1, y0 + 5);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`${label}: ${count} Striche`}
      className={className}
    >
      {strokes}
    </svg>
  );
}
