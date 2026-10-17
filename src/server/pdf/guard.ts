import { getAdminSession, isPinUnlocked } from "../session";

/** PDFs und Exporte der Verwaltung: nur angemeldet und mit PIN. */
export async function verwaltungAllowed(): Promise<boolean> {
  return !!(await getAdminSession()) && (await isPinUnlocked());
}

export const forbidden = () => new Response("Nicht erlaubt", { status: 401 });
