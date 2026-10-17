import { connection } from "next/server";
import { getDb } from "@/db/client";
import { getReceiptFile } from "@/server/purchases";
import { getAdminSession, isPinUnlocked } from "@/server/session";

const UUID = /^[0-9a-f-]{36}$/i;

/** Belegfoto eines Einkaufs – nur angemeldet und mit entsperrter Verwaltung (PIN). */
export async function GET(_request: Request, ctx: RouteContext<"/api/beleg/[id]">) {
  await connection();
  if (!(await getAdminSession()) || !(await isPinUnlocked())) return new Response("Nicht erlaubt", { status: 401 });
  const { id } = await ctx.params;
  if (!UUID.test(id)) return new Response("Nicht gefunden", { status: 404 });
  const f = await getReceiptFile(getDb(), id);
  if (!f) return new Response("Nicht gefunden", { status: 404 });
  return new Response(Buffer.from(f.bytes), {
    headers: {
      "Content-Type": f.mimeType,
      // Nicht im Browser aufheben: nach „Verwaltung sperren“ soll das Foto nicht mehr abrufbar sein.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
