import type { z } from "zod";

/** Ergebnis einer Formular-Aktion. */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error?: string; fieldErrors?: Record<string, string> };

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "_")] ??= issue.message;
  return out;
}

/** Checkbox/Switch im Formular: "on" = an. */
export function checkbox(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}
