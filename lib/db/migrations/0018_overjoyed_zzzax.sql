ALTER TABLE "request_details" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "claimed_at" timestamp with time zone;