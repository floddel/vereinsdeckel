import type { ComponentType, SVGProps } from "react";
import { artIcon } from "./icons/article-art";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { className?: string }>;

/** Alle Artikel-Symbole (farbige Zeichnungen, lokal im Projekt). Schlüssel werden in der Datenbank gespeichert. */
export const ARTICLE_ICONS: Record<string, { label: string; Icon: IconComponent }> = {
  beer: { label: "Bier", Icon: artIcon("beer") },
  "wheat-beer": { label: "Weizen", Icon: artIcon("wheat-beer") },
  soda: { label: "Softdrink", Icon: artIcon("soda") },
  water: { label: "Wasser", Icon: artIcon("water") },
  coffee: { label: "Kaffee", Icon: artIcon("coffee") },
  wine: { label: "Wein", Icon: artIcon("wine") },
  shot: { label: "Schnaps", Icon: artIcon("shot") },
  cocktail: { label: "Cocktail", Icon: artIcon("cocktail") },
  milk: { label: "Milch", Icon: artIcon("milk") },
  sausage: { label: "Wurst", Icon: artIcon("sausage") },
  fish: { label: "Fisch", Icon: artIcon("fish") },
  sandwich: { label: "Brötchen", Icon: artIcon("sandwich") },
  burger: { label: "Burger", Icon: artIcon("burger") },
  drumstick: { label: "Hähnchen", Icon: artIcon("drumstick") },
  pizza: { label: "Pizza", Icon: artIcon("pizza") },
  soup: { label: "Suppe", Icon: artIcon("soup") },
  cake: { label: "Kuchen", Icon: artIcon("cake") },
  "ice-cream": { label: "Eis", Icon: artIcon("ice-cream") },
  snack: { label: "Knabberzeug", Icon: artIcon("snack") },
  candy: { label: "Süßes", Icon: artIcon("candy") },
  cigarette: { label: "Tabak", Icon: artIcon("cigarette") },
  ticket: { label: "Eintritt", Icon: artIcon("ticket") },
  gift: { label: "Spende", Icon: artIcon("gift") },
  other: { label: "Sonstiges", Icon: artIcon("other") },
};

export const ARTICLE_ICON_KEYS = Object.keys(ARTICLE_ICONS);

export function ArticleIcon({ icon, className }: { icon: string | null | undefined; className?: string }) {
  const { Icon } = ARTICLE_ICONS[icon ?? "other"] ?? ARTICLE_ICONS.other;
  return <Icon className={className} aria-hidden="true" />;
}
