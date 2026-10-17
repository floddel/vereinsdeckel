import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { authSecret } from "@/lib/pin";
import { open, seal } from "./secret-box";

/**
 * Zugang zur KI von Anthropic (nur für die Kassenbon-Erkennung, nur wenn eingeschaltet).
 * Schlüssel: in der App hinterlegt (verschlüsselt) oder als Umgebungsvariable ANTHROPIC_API_KEY.
 */
const PURPOSE = "anthropic-api-key";
export const ANTHROPIC_BASE_URL = () => (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
export const ANTHROPIC_MODEL = () => process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

export const sealApiKey = (key: string) => seal(key, authSecret(), PURPOSE);

/** „sk-ant-…a1b2“ – so viel darf die Oberfläche zeigen. */
export const maskKey = (key: string) => `${key.slice(0, 7)}…${key.slice(-4)}`;

export interface AiSettings {
  enabled: boolean;
  /** woher der Schlüssel kommt */
  keySource: "app" | "env" | null;
  keyHint: string | null;
  /** Schlüssel in der App gespeichert, aber nicht lesbar (z. B. BETTER_AUTH_SECRET geändert) */
  keyBroken: boolean;
}

async function readKey(db: Db): Promise<{ key: string | null; source: AiSettings["keySource"]; broken: boolean; enabled: boolean }> {
  const [s] = await db.select({ enabled: settings.aiReceiptsEnabled, enc: settings.anthropicKeyEnc }).from(settings).where(eq(settings.id, 1));
  if (s?.enc) {
    const key = open(s.enc, authSecret(), PURPOSE);
    if (key) return { key, source: "app", broken: false, enabled: s.enabled };
    return { key: null, source: null, broken: true, enabled: !!s?.enabled };
  }
  const env = process.env.ANTHROPIC_API_KEY?.trim();
  return { key: env || null, source: env ? "env" : null, broken: false, enabled: !!s?.enabled };
}

export async function getAiSettings(db: Db): Promise<AiSettings> {
  const r = await readKey(db);
  return { enabled: r.enabled, keySource: r.source, keyHint: r.key ? maskKey(r.key) : null, keyBroken: r.broken };
}

/** Schlüssel für einen Aufruf – nur, wenn die Funktion eingeschaltet ist. */
export async function getActiveApiKey(db: Db): Promise<string | null> {
  const r = await readKey(db);
  return r.enabled ? r.key : null;
}

/** Prüft einen Schlüssel ohne Kosten (Modell-Liste abrufen). */
export async function checkApiKey(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${ANTHROPIC_BASE_URL()}/v1/models?limit=1`, {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Der Schlüssel wird nicht akzeptiert." };
    return { ok: false, error: `Anthropic antwortet mit Fehler ${res.status}.` };
  } catch {
    return { ok: false, error: "Anthropic ist gerade nicht erreichbar." };
  }
}
