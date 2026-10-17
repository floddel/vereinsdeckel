ALTER TABLE "settings" ADD COLUMN "privacy_controller" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "privacy_address" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "privacy_email" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "privacy_authority" text;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "privacy_checks" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Anonymisieren (DSGVO): Namen in Storno-Gründen („Umgebucht auf Peter Weiß“) dürfen ersetzt werden –
-- nur wenn die App das ausdrücklich für diesen Vorgang einschaltet (app.anonymize = 'on')
-- und nur die Spalte „reason“ sich ändert. Alles andere bleibt append-only.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('app.anonymize', true) = 'on'
     AND (to_jsonb(NEW) - 'reason') = (to_jsonb(OLD) - 'reason') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Tabelle % ist nur anhängend (append-only): % ist nicht erlaubt, bitte Storno buchen', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Datensparsamkeit: Browser-Kennung und IP-Adresse der Anmeldungen nicht aufbewahren
UPDATE "auth_session" SET "user_agent" = NULL, "ip_address" = NULL;
