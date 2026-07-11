CREATE INDEX "ticket_attachments_ticket_id_idx" ON "ticket_attachments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_active_created_idx" ON "tickets" USING btree ("created_at" DESC NULLS LAST) WHERE "tickets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tickets_active_creator_idx" ON "tickets" USING btree ("created_by","created_at" DESC NULLS LAST) WHERE "tickets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tickets_active_assignee_idx" ON "tickets" USING btree ("assigned_to","updated_at" DESC NULLS LAST) WHERE "tickets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tickets_active_resolved_idx" ON "tickets" USING btree ("resolved_at") WHERE "tickets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "tickets_deleted_idx" ON "tickets" USING btree ("deleted_at") WHERE "tickets"."deleted_at" is not null;