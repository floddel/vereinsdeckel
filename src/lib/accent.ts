/**
 * Vereinsfarbe (Farbthema) für die ganze App: Theke, Verwaltung und Mitgliederseiten.
 * Gespeichert in den Einstellungen; umgesetzt über <html data-accent="…"> (siehe globals.css).
 * Jede Farbe ist in Hell und Dunkel auf Lesbarkeit geprüft – auch die eigene Farbe (siehe accentVars).
 */
export const ACCENTS = [
  { id: "blau", label: "Blau", light: "#007aff", dark: "#0a84ff" },
  { id: "petrol", label: "Petrol", light: "#0e7c86", dark: "#2ab3c0" },
  { id: "gruen", label: "Grün", light: "#1f8a3b", dark: "#30d158" },
  { id: "gold", label: "Gold", light: "#a87400", dark: "#ffd60a" },
  { id: "rot", label: "Rot", light: "#d70015", dark: "#ff453a" },
  { id: "lila", label: "Lila", light: "#8944ab", dark: "#bf5af2" },
  { id: "graphit", label: "Graphit", light: "#3a3a3c", dark: "#e5e5ea" },
] as const;

export type PresetAccent = (typeof ACCENTS)[number]["id"];
/** Eigene Farbe: Farbton 0–359 und Kräftigkeit 0–100, gespeichert als „eigen-210-70“ */
export type CustomAccent = `eigen-${number}-${number}`;
export type AccentId = PresetAccent | CustomAccent;
export const DEFAULT_ACCENT: PresetAccent = "blau";
/** Startwerte für „Eigene Farbe“ (ein kräftiges Blau) */
export const CUSTOM_DEFAULT = { hue: 250, strength: 70 };

export function parseCustomAccent(v: string): { hue: number; strength: number } | null {
  const m = /^eigen-(\d{1,3})-(\d{1,3})$/.exec(v);
  if (!m) return null;
  const hue = Number(m[1]);
  const strength = Number(m[2]);
  return hue < 360 && strength <= 100 ? { hue, strength } : null;
}

export function customAccent(hue: number, strength: number): CustomAccent {
  const h = ((Math.round(hue) % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, Math.round(strength)));
  return `eigen-${h}-${s}`;
}

export function isAccent(v: unknown): v is AccentId {
  return typeof v === "string" && (ACCENTS.some((a) => a.id === v) || parseCustomAccent(v) !== null);
}

// --- Farben berechnen (OKLCH → sRGB), damit jede eigene Farbe lesbar bleibt ---

type Rgb = [number, number, number];

/** OKLCH in lineares sRGB (Werte außerhalb 0…1 = außerhalb des darstellbaren Bereichs) */
function oklchToLinear(l: number, c: number, hue: number): Rgb {
  const h = (hue * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/**
 * Farbe mit gegebener Helligkeit und Farbton; die Sättigung wird so weit verringert, bis sie darstellbar ist.
 * Gerundet wie im Hex-Wert, damit die Kontrastprüfung für genau die Farbe gilt, die später angezeigt wird.
 */
function color(l: number, c: number, hue: number): Rgb {
  return hexToLinear(toHex(gamutMap(l, c, hue)));
}

function gamutMap(l: number, c: number, hue: number): Rgb {
  let rgb = oklchToLinear(l, c, hue);
  if (inGamut(rgb)) return rgb;
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToLinear(l, mid, hue))) lo = mid;
    else hi = mid;
  }
  rgb = oklchToLinear(l, lo, hue);
  return rgb.map((v) => Math.max(0, Math.min(1, v))) as Rgb;
}

const luminance = ([r, g, b]: Rgb) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
export const contrast = (a: Rgb, b: Rgb) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const toHex = (rgb: Rgb) =>
  `#${rgb
    .map((v) => {
      const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(Math.max(0, Math.min(1, s)) * 255)
        .toString(16)
        .padStart(2, "0");
    })
    .join("")}`;

export function hexToLinear(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
}

const WHITE: Rgb = [1, 1, 1];
/** Karten im Dunkelmodus (#1c1c1e) – dunkler Grund, auf dem die Farbe lesbar sein muss */
const DARK_CARD = hexToLinear("#1c1c1e");

/** Helligkeit von `from` in Schritten verändern, bis `ok` gilt (oder die Grenze erreicht ist). */
function search(from: number, step: number, c: number, hue: number, ok: (rgb: Rgb) => boolean): Rgb {
  let l = from;
  let rgb = color(l, c, hue);
  while (!ok(rgb) && l > 0.05 && l < 0.98) {
    l += step;
    rgb = color(l, c, hue);
  }
  return rgb;
}

export type AccentVars = Record<"--tint-light" | "--tint-dark" | "--on-tint-dark" | "--tint-2" | "--print", string>;

/**
 * CSS-Variablen für eine eigene Farbe – mit denselben Regeln wie die festen Farben:
 * hell: weiße Schrift auf der Farbe und die Farbe als Schrift auf Weiß (Kontrast mind. 4,5);
 * dunkel: die Farbe als Schrift auf dunklem Grund (mind. 4,5), Schrift auf Knöpfen weiß oder dunkel – was besser lesbar ist;
 * Bierdeckel-Rand (--print): weiße Schrift darauf (mind. 7).
 */
export function accentVars(hue: number, strength: number): AccentVars {
  const c = 0.2 * (strength / 100);
  const light = search(0.62, -0.01, c, hue, (rgb) => contrast(rgb, WHITE) >= 4.5);
  const dark = search(0.7, 0.01, c, hue, (rgb) => contrast(rgb, DARK_CARD) >= 4.5);
  const onDarkCandidate = color(0.22, Math.min(c, 0.05), hue);
  const onDark = contrast(dark, WHITE) >= contrast(dark, onDarkCandidate) ? WHITE : onDarkCandidate;
  const print = search(0.48, -0.01, c, hue, (rgb) => contrast(rgb, WHITE) >= 7);
  const second = color(0.72, c * 0.8, (hue + 35) % 360);
  return {
    "--tint-light": toHex(light),
    "--tint-dark": toHex(dark),
    "--on-tint-dark": toHex(onDark),
    "--tint-2": toHex(second),
    "--print": toHex(print),
  };
}

const VAR_NAMES = ["--tint-light", "--tint-dark", "--on-tint-dark", "--tint-2", "--print"] as const;

/** Zuletzt bekannte Vereinsfarbe im Browser – damit sie schon vor dem Laden (und offline) stimmt. */
export const ACCENT_KEY = "vd-akzent";
/** Bei eigener Farbe: die berechneten Variablen (das Skript vor dem ersten Anzeigen rechnet nicht selbst) */
export const ACCENT_VARS_KEY = "vd-akzent-farben";

/** Farbe sofort an der Seite setzen und für das nächste Laden merken. */
export function applyAccent(accent: AccentId) {
  const d = document.documentElement;
  const custom = parseCustomAccent(accent);
  const vars = custom ? accentVars(custom.hue, custom.strength) : null;
  for (const name of VAR_NAMES) d.style.removeProperty(name);
  if (vars) {
    for (const name of VAR_NAMES) d.style.setProperty(name, vars[name]);
    d.dataset.accent = "eigen";
  } else if (accent === DEFAULT_ACCENT) delete d.dataset.accent;
  else d.dataset.accent = accent;
  try {
    localStorage.setItem(ACCENT_KEY, accent);
    if (vars) localStorage.setItem(ACCENT_VARS_KEY, JSON.stringify(vars));
    else localStorage.removeItem(ACCENT_VARS_KEY);
  } catch {
    // privates Fenster o. Ä.: gilt dann nur bis zum Neuladen
  }
}
