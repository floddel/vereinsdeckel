import pkg from "../../package.json";

/**
 * Angaben zum Projekt für die Seite „Über Vereinsdeckel“ und die Fußzeile der Verwaltung.
 * Lizenz AGPL-3.0: Wer eine veränderte Version betreibt, setzt SOURCE_CODE_URL auf seinen Quellcode (§ 13).
 */
export const ABOUT = {
  name: "Vereinsdeckel",
  tagline: "Der digitale Bierdeckel für Vereine",
  author: "floddel",
  version: pkg.version,
  license: "GNU Affero General Public License v3.0 (AGPL-3.0)",
  licenseUrl: "https://www.gnu.org/licenses/agpl-3.0.html",
  sponsorsUrl: "https://github.com/sponsors/floddel",
  paypalUrl: "https://paypal.me/xygoht",
} as const;

export const DEFAULT_SOURCE_CODE_URL = "https://github.com/floddel/vereinsdeckel";

/** Wo der Quellcode genau dieser Installation steht (AGPL § 13). */
export function sourceCodeUrl(env: Record<string, string | undefined> = process.env): string {
  const url = env.SOURCE_CODE_URL?.trim();
  return url && /^https:\/\//.test(url) ? url : DEFAULT_SOURCE_CODE_URL;
}
