import { getDb } from "@/db/client";
import { settings } from "@/db/schema";
import type { Brand } from "@/components/admin/brand-mark";

/** Vereinsname und Logo für Kopf- und Seitenleiste. */
export async function getBrand(): Promise<Brand> {
  const [s] = await getDb()
    .select({ clubName: settings.clubName, logoFileId: settings.logoFileId })
    .from(settings);
  return {
    clubName: s?.clubName ?? "Verein",
    logoUrl: s?.logoFileId ? `/api/datei/${s.logoFileId}` : null,
  };
}
