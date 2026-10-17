ALTER TABLE "settings" ADD COLUMN "test_phase_ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "data_reset_at" timestamp with time zone;--> statement-breakpoint
-- Zurücksetzen in der Testphase: Löschen von Bewegungsdaten nur, wenn der Vorgang es ausdrücklich
-- für seine eigene Transaktion erlaubt (set_config('app.reset', 'on', true)) UND die Testphase noch läuft.
-- Alles andere bleibt wie bisher: nur anhängen, Korrekturen per Storno, kein TRUNCATE.
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND current_setting('app.anonymize', true) = 'on'
     AND (to_jsonb(NEW) - 'reason') = (to_jsonb(OLD) - 'reason') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
     AND current_setting('app.reset', true) = 'on'
     AND EXISTS (SELECT 1 FROM "settings" WHERE "id" = 1 AND "test_phase_ended_at" IS NULL) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Tabelle % ist nur anhängend (append-only): % ist nicht erlaubt, bitte Storno buchen', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
-- Testphase beenden ist endgültig: einmal gesetzt, lässt sich der Zeitpunkt nicht mehr ändern oder löschen.
CREATE OR REPLACE FUNCTION keep_test_phase_ended() RETURNS trigger AS $$
BEGIN
  IF OLD."test_phase_ended_at" IS NOT NULL
     AND NEW."test_phase_ended_at" IS DISTINCT FROM OLD."test_phase_ended_at" THEN
    RAISE EXCEPTION 'Die Testphase ist beendet und lässt sich nicht wieder öffnen'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER settings_test_phase_final BEFORE UPDATE ON "settings"
  FOR EACH ROW EXECUTE FUNCTION keep_test_phase_ended();
