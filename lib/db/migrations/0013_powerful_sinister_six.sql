CREATE TYPE "public"."system_status" AS ENUM('ACTIVE', 'DEPRECATED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."system_type" AS ENUM('SHEET', 'APPS_SCRIPT', 'WEB_APP', 'OTHER');--> statement-breakpoint
CREATE SEQUENCE "public"."system_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "access_grantees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "access_grantees_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "system_access_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"system_id" uuid NOT NULL,
	"grantee_id" uuid,
	"grantee_label" text NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "systems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"system_type" "system_type" NOT NULL,
	"department" "department" NOT NULL,
	"owner_id" uuid NOT NULL,
	"frontend_url" text NOT NULL,
	"backend_url" text,
	"status" "system_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"linked_ticket_id" uuid,
	"logged_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "systems_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "system_access_confirmations" ADD CONSTRAINT "system_access_confirmations_system_id_systems_id_fk" FOREIGN KEY ("system_id") REFERENCES "public"."systems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_access_confirmations" ADD CONSTRAINT "system_access_confirmations_grantee_id_access_grantees_id_fk" FOREIGN KEY ("grantee_id") REFERENCES "public"."access_grantees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_access_confirmations" ADD CONSTRAINT "system_access_confirmations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_linked_ticket_id_tickets_id_fk" FOREIGN KEY ("linked_ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "systems" ADD CONSTRAINT "systems_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_grantees_is_active_idx" ON "access_grantees" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "system_access_confirmations_system_id_idx" ON "system_access_confirmations" USING btree ("system_id");--> statement-breakpoint
CREATE INDEX "systems_code_idx" ON "systems" USING btree ("code");--> statement-breakpoint
CREATE INDEX "systems_name_idx" ON "systems" USING btree ("name");--> statement-breakpoint
CREATE INDEX "systems_department_idx" ON "systems" USING btree ("department");--> statement-breakpoint
CREATE INDEX "systems_status_idx" ON "systems" USING btree ("status");
--> statement-breakpoint
-- §13.2: seed the required access-grantees. This lives in the MIGRATION, not in
-- lib/db/seed.ts, because seed.ts is a dev-only script that never runs against
-- production — and an EMPTY access_grantees table would silently void §13.4's hard
-- rule ("every active grantee confirmed" is vacuously true over an empty set).
-- createSystem also refuses when the list is empty, so this is belt-and-braces.
-- Idempotent: label is UNIQUE, so a re-run is a no-op rather than a duplicate.
INSERT INTO "access_grantees" ("label", "is_active", "sort_order") VALUES
  ('Naushi Ma''am', true, 1),
  ('Raghav Sir', true, 2)
ON CONFLICT ("label") DO NOTHING;
