CREATE TYPE "public"."access_request_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"image" text,
	"status" "access_request_status" DEFAULT 'PENDING' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"created_user_id" uuid,
	CONSTRAINT "access_requests_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access_requests" ADD CONSTRAINT "access_requests_created_user_id_users_id_fk" FOREIGN KEY ("created_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "access_requests_status_idx" ON "access_requests" USING btree ("status");