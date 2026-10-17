-- Append-only: Bewegungsdaten dürfen nie geändert oder gelöscht werden.
-- Korrekturen nur per Storno (neue Zeile).
CREATE OR REPLACE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Tabelle % ist nur anhängend (append-only): % ist nicht erlaubt, bitte Storno buchen', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER sale_append_only BEFORE UPDATE OR DELETE ON "sale"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER sale_no_truncate BEFORE TRUNCATE ON "sale"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER sale_line_append_only BEFORE UPDATE OR DELETE ON "sale_line"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER sale_line_no_truncate BEFORE TRUNCATE ON "sale_line"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER payment_append_only BEFORE UPDATE OR DELETE ON "payment"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER payment_no_truncate BEFORE TRUNCATE ON "payment"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER purchase_append_only BEFORE UPDATE OR DELETE ON "purchase"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER purchase_no_truncate BEFORE TRUNCATE ON "purchase"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER purchase_line_append_only BEFORE UPDATE OR DELETE ON "purchase_line"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER purchase_line_no_truncate BEFORE TRUNCATE ON "purchase_line"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER cash_movement_append_only BEFORE UPDATE OR DELETE ON "cash_movement"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER cash_movement_no_truncate BEFORE TRUNCATE ON "cash_movement"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER cash_count_append_only BEFORE UPDATE OR DELETE ON "cash_count"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER cash_count_no_truncate BEFORE TRUNCATE ON "cash_count"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER inventory_count_append_only BEFORE UPDATE OR DELETE ON "inventory_count"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER inventory_count_no_truncate BEFORE TRUNCATE ON "inventory_count"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER inventory_line_append_only BEFORE UPDATE OR DELETE ON "inventory_line"
  FOR EACH ROW EXECUTE FUNCTION forbid_change();
--> statement-breakpoint
CREATE TRIGGER inventory_line_no_truncate BEFORE TRUNCATE ON "inventory_line"
  FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
