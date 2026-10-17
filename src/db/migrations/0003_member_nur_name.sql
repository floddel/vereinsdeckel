DROP INDEX "member_member_no_unique";--> statement-breakpoint
-- Schon vorhandene doppelte Namen unterscheidbar machen („Klaus Müller (2)“), sonst scheitert der eindeutige Index.
UPDATE "member" AS m SET "name" = m."name" || ' (' || d.rn || ')'
FROM (SELECT "id", row_number() OVER (PARTITION BY lower("name") ORDER BY "created_at", "id") AS rn FROM "member") AS d
WHERE m."id" = d."id" AND d.rn > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "member_name_unique" ON "member" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "member_no";--> statement-breakpoint
ALTER TABLE "member" DROP COLUMN "email";