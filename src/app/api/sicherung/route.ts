import { connection } from "next/server";
import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import { businessDate } from "@/domain/business-date";
import { backupFileName, exportBackup, importBackup, type ImportMode, parseBackup } from "@/server/backup";
import { invalidatePublicMenu } from "@/server/menu";
import { forbidden, verwaltungAllowed } from "@/server/pdf/guard";
import { isSameOrigin } from "@/server/same-origin";

/** Sicherung herunterladen (?belege=1 mit Belegfotos). Nur angemeldet und mit PIN. */
export async function GET(request: Request) {
  await connection();
  if (!(await verwaltungAllowed())) return forbidden();
  const receipts = new URL(request.url).searchParams.get("belege") === "1";
  const backup = await exportBackup(getDb(), { receipts });
  return new Response(JSON.stringify(backup), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backupFileName(backup)}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Sicherung in eine frische Installation übernehmen (Formular mit Datei und Art). */
export async function POST(request: Request) {
  await connection();
  if (!isSameOrigin(request)) return Response.json({ ok: false, error: "Nicht erlaubt" }, { status: 403 });
  if (!(await verwaltungAllowed())) return forbidden();
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ ok: false, error: "Bitte eine Sicherungsdatei auswählen." }, { status: 400 });
  }
  const upload = form.get("datei");
  const mode = form.get("art");
  if (!(upload instanceof File) || upload.size === 0) return Response.json({ ok: false, error: "Bitte eine Sicherungsdatei auswählen." }, { status: 400 });
  if (mode !== "stammdaten" && mode !== "alles") return Response.json({ ok: false, error: "Bitte wählen, was übernommen werden soll." }, { status: 400 });

  const backup = parseBackup(await upload.text());
  if (typeof backup === "string") return Response.json({ ok: false, error: backup }, { status: 400 });
  const db = getDb();
  const [s] = await db.select({ cutoffHour: settings.businessDayCutoffHour }).from(settings);
  const result = await importBackup(db, backup, mode as ImportMode, businessDate(new Date(), s?.cutoffHour ?? 6));
  invalidatePublicMenu();
  return Response.json(result, { status: result.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
