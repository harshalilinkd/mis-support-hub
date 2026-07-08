ALTER TABLE "tickets" ALTER COLUMN "number" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "ticket_activity_ticket_id_idx" ON "ticket_activity" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_id_idx" ON "ticket_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_status_idx" ON "tickets" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tickets_assigned_to_idx" ON "tickets" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "tickets_created_by_idx" ON "tickets" USING btree ("created_by");--> statement-breakpoint
DROP SEQUENCE "public"."mis_ticket_seq";