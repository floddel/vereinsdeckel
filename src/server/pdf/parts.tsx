import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { file, settings } from "@/db/schema";

/**
 * Gemeinsame Bausteine für alle PDFs. Schriften: nur die PDF-Standardschriften Helvetica und Courier
 * (in jedem PDF-Programm eingebaut) – keine Schriftdateien, keine externen Quellen.
 */

export const COLOR = { text: "#16222e", muted: "#5d6b78", line: "#d7dee5", primary: "#0b6fa4", bad: "#c0392b" };

export const s = StyleSheet.create({
  page: { paddingTop: 36, paddingBottom: 48, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.5, color: COLOR.text },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  logo: { width: 40, height: 40, objectFit: "contain" },
  club: { fontSize: 9, color: COLOR.muted },
  title: { fontSize: 17, fontFamily: "Helvetica-Bold" },
  subtitle: { fontSize: 10, color: COLOR.muted, marginTop: 2 },
  h2: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  muted: { color: COLOR.muted },
  bold: { fontFamily: "Helvetica-Bold" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLOR.line, paddingVertical: 3.5 },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLOR.text, paddingBottom: 3, marginBottom: 1 },
  footer: { position: "absolute", bottom: 22, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COLOR.muted },
  figures: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  figure: { width: "31.5%", borderWidth: 0.75, borderColor: COLOR.line, borderRadius: 6, padding: 8 },
  figureLabel: { fontSize: 8.5, color: COLOR.muted },
  figureValue: { fontSize: 14, fontFamily: "Helvetica-Bold", marginTop: 2 },
});

export interface Brand {
  clubName: string;
  /** PNG/JPEG als Data-URL (andere Formate kann das PDF nicht) */
  logo: string | null;
}

/** Nur der Vereinsname – für PDFs ohne Logo (Kassenzettel über den Mitgliederlink). */
export async function loadClubName(db: Db): Promise<string> {
  const [st] = await db.select({ clubName: settings.clubName }).from(settings);
  return st?.clubName ?? "Verein";
}

export async function loadBrand(db: Db): Promise<Brand> {
  const [st] = await db.select({ clubName: settings.clubName, logoFileId: settings.logoFileId }).from(settings);
  let logo: string | null = null;
  if (st?.logoFileId) {
    const [f] = await db.select().from(file).where(eq(file.id, st.logoFileId));
    if (f && (f.mimeType === "image/png" || f.mimeType === "image/jpeg")) logo = `data:${f.mimeType};base64,${Buffer.from(f.bytes).toString("base64")}`;
  }
  return { clubName: st?.clubName ?? "Verein", logo };
}

const created = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

/** A4-Dokument mit Kopf (Logo, Verein, Titel) und Fuß (erstellt am, Seitenzahl). */
export function A4({ brand, title, subtitle, children, now = new Date() }: { brand: Brand; title: string; subtitle?: string; children: ReactNode; now?: Date }) {
  return (
    <Document title={`${title} – ${brand.clubName}`} author={brand.clubName} creator="Vereinsdeckel" producer="Vereinsdeckel">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf-Bild, kein HTML */}
          {brand.logo && <Image src={brand.logo} style={s.logo} />}
          <View>
            <Text style={s.club}>{brand.clubName}</Text>
            <Text style={s.title}>{title}</Text>
            {subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
          </View>
        </View>
        {children}
        <View style={s.footer} fixed>
          <Text>Erstellt am {created.format(now)}</Text>
          <Text render={({ pageNumber, totalPages }) => `Seite ${pageNumber} von ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export interface Column {
  label: string;
  /** Anteil der Breite (flex) */
  flex: number;
  align?: "left" | "right";
}

/** Tabelle: Kopfzeile wiederholt sich auf jeder Seite. */
export function Table({ columns, rows, bold }: { columns: Column[]; rows: (string | number)[][]; bold?: (row: number) => boolean }) {
  return (
    <View>
      <View style={s.headRow} fixed>
        {columns.map((c, i) => (
          <Text key={i} style={{ flex: c.flex, textAlign: c.align ?? "left", fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View key={ri} style={s.row} wrap={false}>
          {r.map((cell, ci) => (
            <Text key={ci} style={{ flex: columns[ci].flex, textAlign: columns[ci].align ?? "left", fontFamily: bold?.(ri) ? "Helvetica-Bold" : "Helvetica" }}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function Figures({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <View style={s.figures}>
      {items.map((f) => (
        <View key={f.label} style={s.figure} wrap={false}>
          <Text style={s.figureLabel}>{f.label}</Text>
          <Text style={s.figureValue}>{f.value}</Text>
          {f.hint && <Text style={[s.figureLabel, { marginTop: 2 }]}>{f.hint}</Text>}
        </View>
      ))}
    </View>
  );
}

/** Dateiname ohne Sonderzeichen, z. B. „abendabschluss-2026-10-15.pdf“. */
export const fileSlug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export function pdfResponse(bytes: Uint8Array, filename: string, download = false): Response {
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
