ALTER TABLE "tickets" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tickets" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;