ALTER TABLE "tickets" ALTER COLUMN "priority" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "tickets" ALTER COLUMN "priority" DROP NOT NULL;