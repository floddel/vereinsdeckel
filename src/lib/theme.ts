/**
 * Darstellung je Gerät: Automatisch (wie das Gerät), Hell oder Dunkel.
 * Gespeichert nur im Browser dieses Geräts (kein Server, keine personenbezogenen Daten).
 * Umgesetzt über <html data-theme="light|dark">, siehe globals.css.
 */
import { ACCENT_KEY, ACCENT_VARS_KEY } from "./accent";

export type ThemeChoice = "system" | "light" | "dark";

const KEY = "vd-darstellung";
const GLASS_KEY = "vd-glas";
const EVENT = "vd-darstellung";
/** Glas-Stärke in Prozent: 0 = klar, 100 = milchig */
export const GLASS_DEFAULT = 50;

/** Seiten für Mitglieder (Bierdeckel, Karte, „So geht's“): ohne eigene Wahl immer hell – nicht wie das Gerät. */
export const LIGHT_BY_DEFAULT = /^\/(m\/|karte|so-gehts)/;

/** Läuft im <head> vor dem ersten Anzeigen – verhindert kurzes Aufblitzen der falschen Farben. */
export const themeScript = `try{var d=document.documentElement,t=localStorage.getItem("${KEY}"),g=localStorage.getItem("${GLASS_KEY}");if(t==="light"||t==="dark")d.dataset.theme=t;else if(${LIGHT_BY_DEFAULT}.test(location.pathname))d.dataset.theme="light";if(g!==null&&g>=0&&g<=100)d.style.setProperty("--glass-strength",g/100);var a=localStorage.getItem("${ACCENT_KEY}");if(a&&a!=="blau"&&/^[a-z]+$/.test(a))d.dataset.accent=a;else if(a&&/^eigen-/.test(a)){var v=JSON.parse(localStorage.getItem("${ACCENT_VARS_KEY}")||"{}");for(var k in v)if(/^--[a-z0-9-]+$/.test(k)&&/^#[0-9a-f]{6}$/.test(v[k]))d.style.setProperty(k,v[k]);d.dataset.accent="eigen"}}catch(e){}`;

export function readTheme(): ThemeChoice {
  try {
    const t = localStorage.getItem(KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

/** Gespeicherte Wahl, auf Mitgliederseiten ohne Wahl „Hell“. */
export function readMemberTheme(): "light" | "dark" {
  return readTheme() === "dark" ? "dark" : "light";
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    // privates Fenster o. Ä.: gilt dann nur bis zum Neuladen
  }
  if (choice === "system" && LIGHT_BY_DEFAULT.test(location.pathname)) document.documentElement.dataset.theme = "light";
  else if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeTheme(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readGlass(): number {
  try {
    const g = Number(localStorage.getItem(GLASS_KEY) ?? GLASS_DEFAULT);
    return Number.isFinite(g) && g >= 0 && g <= 100 ? g : GLASS_DEFAULT;
  } catch {
    return GLASS_DEFAULT;
  }
}

export function setGlass(percent: number) {
  const g = Math.max(0, Math.min(100, Math.round(percent)));
  try {
    localStorage.setItem(GLASS_KEY, String(g));
  } catch {
    // gilt dann nur bis zum Neuladen
  }
  document.documentElement.style.setProperty("--glass-strength", String(g / 100));
  window.dispatchEvent(new Event(EVENT));
}
