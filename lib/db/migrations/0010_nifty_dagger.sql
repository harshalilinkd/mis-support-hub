CREATE TYPE "public"."md_decision" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."progress_log_type" AS ENUM('UPDATE', 'REVIEW_SESSION', 'BLOCKER');--> statement-breakpoint
CREATE TYPE "public"."ticket_type" AS ENUM('ISSUE', 'REQUEST');--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'SUBMITTED';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'UNDER_REVIEW';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'PENDING_MD_APPROVAL';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'APPROVED';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'DROPPED';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'CLAIMED';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'IN_TESTING';--> statement-breakpoint
ALTER TYPE "public"."status" ADD VALUE 'CHANGES_REQUESTED';--> statement-breakpoint
CREATE SEQUENCE "public"."request_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "progress_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"type" "progress_log_type" NOT NULL,
	"body" text NOT NULL,
	"percent_complete" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_details" (
	"ticket_id" uuid PRIMARY KEY NOT NULL,
	"system_name" text NOT NULL,
	"problem_statement" text NOT NULL,
	"current_process" text,
	"current_sheet_link" text,
	"intended_users" text NOT NULL,
	"expected_benefit" text NOT NULL,
	"urgency" "priority" NOT NULL,
	"target_date" date,
	"md_decision" "md_decision" DEFAULT 'PENDING' NOT NULL,
	"md_decision_recorded_by" uuid,
	"md_decided_at" timestamp with time zone,
	"md_remark" text,
	"claimed_by" uuid,
	"claimed_at" timestamp with time zone,
	"deadline" date,
	"revision_round" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "type" "ticket_type" DEFAULT 'ISSUE' NOT NULL;--> statement-breakpoint
--> P10 backfill: every pre-existing ticket is an ISSUE (the ADD COLUMN default already
--> sets this; this UPDATE makes the backfill explicit per the spec). No existing rows are
--> renumbered — the live MIS- sequence/format is untouched.
UPDATE "tickets" SET "type" = 'ISSUE';--> statement-breakpoint
ALTER TABLE "progress_logs" ADD CONSTRAINT "progress_logs_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_logs" ADD CONSTRAINT "progress_logs_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_details" ADD CONSTRAINT "request_details_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_details" ADD CONSTRAINT "request_details_md_decision_recorded_by_users_id_fk" FOREIGN KEY ("md_decision_recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_details" ADD CONSTRAINT "request_details_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_logs_ticket_id_idx" ON "progress_logs" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_type_idx" ON "tickets" USING btree ("type");