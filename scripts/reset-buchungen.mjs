/**
 * Entwicklung: alle Buchungen der lokalen Datenbank löschen – zum Neu-Testen.
 * Bleibt erhalten: Mitglieder (mit Links/QR-Codes), Artikel, Kategorien, Einstellungen, Anmeldung, PIN, Logo,
 * der Anfangsbestand (Einkäufe mit Herkunft „Anfangsbestand“) und die Inventuren bis dahin
 * (bis 1 Minute nach dem letzten Anfangsbestand) – so stimmt der Bestand danach wieder.
 * Gelöscht: Bons, Zahlungen, Handy-Bestellungen, alle anderen Einkäufe (mit Belegfotos), Kassenbewegungen,
 * Kassenzählungen, spätere Inventuren, Abende.
 *
 * Aufruf: npm run db:reset-buchungen            (der Entwicklungsserver muss dafür gestoppt sein)
 *         npm run db:reset-buchungen -- --alles  (auch Anfangsbestand und alle Inventuren löschen)
 * Nur für die lokale PGlite-Datenbank – nie für die echte Datenbank im Internet.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const dir = path.resolve(process.env.PGLITE_DIR ?? ".data/dev");
if (process.env.NODE_ENV === "production" || process.env.DATABASE_URL) {
  console.error("Abbruch: Nur für die lokale Entwicklungsdatenbank.");
  process.exit(1);
}
if (!existsSync(dir)) {
  console.error(`Abbruch: Keine Datenbank in ${dir}.`);
  process.exit(1);
}
// Läuft noch ein Programm auf der Datenbank (z. B. npm run dev)? Dann nicht anfassen.
try {
  const users = execFileSync("lsof", ["-t", "+D", dir], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  if (users) {
    console.error("Abbruch: Der Entwicklungsserver läuft noch. Bitte erst stoppen (Strg+C im Terminal von „npm run dev“).");
    process.exit(1);
  }
} catch {
  // lsof findet nichts → Exit-Code 1 → niemand nutzt die Datenbank
}

const all = process.argv.includes("--alles");
const db = new PGlite(dir);
const count = async (table) => (await db.query(`select count(*)::int as n from "${table}"`)).rows[0].n;
const before = { bons: await count("sale"), zahlungen: await count("payment"), einkaeufe: await count("purchase"), inventuren: await count("inventory_count") };

await db.transaction(async (tx) => {
  // Schutz gegen Löschen (append-only) nur für diesen Vorgang aussetzen
  await tx.exec("set local session_replication_role = replica");
  await tx.exec(`
    delete from food_order_line; delete from food_order;
    delete from payment; delete from sale_line; delete from sale;
    delete from cash_count; delete from cash_movement;
    create temp table keep_purchase on commit drop as
      select id, created_at from purchase where ${all ? "false" : "source = 'opening' and reverses_purchase_id is null and id not in (select reverses_purchase_id from purchase where reverses_purchase_id is not null)"};
    create temp table drop_inventory on commit drop as
      select id from inventory_count where ${all ? "true" : "counted_at > coalesce((select max(created_at) from keep_purchase) + interval '1 minute', '-infinity')"};
    delete from inventory_line where inventory_count_id in (select id from drop_inventory);
    delete from inventory_count where id in (select id from drop_inventory);
    create temp table receipt_files on commit drop as
      select receipt_file_id as id from purchase where receipt_file_id is not null and id not in (select id from keep_purchase);
    delete from purchase_line where purchase_id not in (select id from keep_purchase);
    delete from purchase where id not in (select id from keep_purchase);
    delete from file where id in (select id from receipt_files);
    delete from event;
    update settings set kitchen_open = false;
  `);
});
const kept = await count("purchase");
const keptInv = await count("inventory_count");
await db.close();
console.log(
  `Fertig: ${before.bons} Bons, ${before.zahlungen} Zahlungen, ${before.einkaeufe - kept} Einkäufe und ${before.inventuren - keptInv} Inventuren gelöscht.`,
);
if (kept) console.log(`Behalten: ${kept} Anfangsbestand-Einkauf/-Einkäufe und ${keptInv} Inventur(en) – der Bestand steht wieder auf dem Anfangsbestand.`);
console.log("Mitglieder, Artikel, Einstellungen, Anmeldung und PIN sind unverändert. Jetzt wieder: npm run dev");
