/**
 * CSV-Import von Mitgliedern (z. B. aus Excel exportiert).
 * - Trennzeichen ";" (deutsches Excel), "," oder Tab wird automatisch erkannt
 * - Anführungszeichen und BOM werden verstanden
 * - Kopfzeile: Spalte „Name“ – oder „Vorname“ + „Nachname“ (werden zusammengesetzt)
 * - Alle anderen Spalten (Nummer, E-Mail, Adresse …) werden bewusst ignoriert (Datensparsamkeit)
 * - Ohne erkennbare Kopfzeile: erste Spalte = Name
 */
export interface MemberCsvRow {
  line: number;
  name: string;
}

export interface MemberCsvResult {
  rows: MemberCsvRow[];
  errors: { line: number; message: string }[];
  /** Überschriften der Spalten, die nicht übernommen werden */
  ignoredColumns: string[];
}

export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function detectDelimiter(firstLine: string): string {
  const semicolons = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  const tabs = (firstLine.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons >= commas ? ";" : ",";
}

const HEADER = {
  name: /^(name|vor- und nachname|vorname nachname|nachname, vorname|mitglied|mitgliedsname)$/i,
  first: /^(vorname|rufname)$/i,
  last: /^(nachname|familienname|zuname)$/i,
};

/** Leerzeichen am Rand entfernen und mehrfache Leerzeichen zusammenfassen. */
export function cleanName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/** Vergleichswert für „gleicher Name“ (wie der eindeutige Index in der Datenbank). */
export function nameKey(name: string): string {
  return cleanName(name).toLowerCase();
}

export function parseMemberCsv(input: string): MemberCsvResult {
  const text = input.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const table = parseCsv(text, detectDelimiter(firstLine)).map((r) => r.map((c) => c.trim()));

  const head = table[0] ?? [];
  const nameIdx = head.findIndex((h) => HEADER.name.test(h));
  const firstIdx = head.findIndex((h) => HEADER.first.test(h));
  const lastIdx = head.findIndex((h) => HEADER.last.test(h));
  const hasHeader = nameIdx >= 0 || firstIdx >= 0 || lastIdx >= 0;
  const used = nameIdx >= 0 ? [nameIdx] : hasHeader ? [firstIdx, lastIdx].filter((i) => i >= 0) : [0];
  const nameOf = (r: string[]) => cleanName(used.map((i) => r[i] ?? "").join(" "));

  const result: MemberCsvResult = {
    rows: [],
    errors: [],
    ignoredColumns: hasHeader ? head.filter((h, i) => h !== "" && !used.includes(i)) : [],
  };
  const seen = new Set<string>();
  for (let i = hasHeader ? 1 : 0; i < table.length; i++) {
    const r = table[i];
    const line = i + 1;
    if (r.every((c) => c === "")) continue;
    const name = nameOf(r);

    if (!name) {
      result.errors.push({ line, message: "Name fehlt" });
      continue;
    }
    if (name.length > 80) {
      result.errors.push({ line, message: "Name ist zu lang" });
      continue;
    }
    if (seen.has(nameKey(name))) {
      result.errors.push({ line, message: `„${name}“ steht doppelt in der Datei` });
      continue;
    }
    seen.add(nameKey(name));
    result.rows.push({ line, name });
  }
  return result;
}
