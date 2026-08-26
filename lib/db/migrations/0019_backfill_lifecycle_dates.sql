-- Backfill the lifecycle date columns added in 0017/0018 from the audit trail.
--
-- tickets.claimed_at / tickets.started_at and request_details.started_at were added
-- empty, so every ticket claimed or started BEFORE those migrations has NULL. That is
-- not merely cosmetic: the bulk-start wizard offers "did work start on the day it was
-- claimed?" only when it knows the claim day, so on a live database the shortcut never
-- appeared for a single existing ticket.
--
-- ticket_activity already holds the answer: a CLAIMED row is written the moment a claim
-- happens and a STARTED row the moment work begins (§12.5), and their created_at IS
-- when it happened. MIN() because a ticket can be claimed, released and re-claimed —
-- the FIRST is the one tickets.claimed_at means (writeAssigned stamps only the first
-- self-claim). Only rows that are still NULL are touched, so a date MIS has since
-- picked by hand is never overwritten, and re-running this is a no-op.

UPDATE "tickets" AS t
SET "claimed_at" = a."at"
FROM (
  SELECT "ticket_id", MIN("created_at") AS "at"
  FROM "ticket_activity"
  WHERE "type" = 'CLAIMED'
  GROUP BY "ticket_id"
) AS a
WHERE t."id" = a."ticket_id"
  AND t."claimed_at" IS NULL
  AND t."assigned_to" IS NOT NULL;
--> statement-breakpoint

UPDATE "tickets" AS t
SET "started_at" = a."at"
FROM (
  SELECT "ticket_id", MIN("created_at") AS "at"
  FROM "ticket_activity"
  WHERE "type" = 'STARTED'
  GROUP BY "ticket_id"
) AS a
WHERE t."id" = a."ticket_id"
  AND t."started_at" IS NULL
  AND t."type" = 'ISSUE';
--> statement-breakpoint

-- The request twin. request_details.claimed_at has existed all along, so only the
-- build's start date needs filling.
UPDATE "request_details" AS r
SET "started_at" = a."at"
FROM (
  SELECT "ticket_id", MIN("created_at") AS "at"
  FROM "ticket_activity"
  WHERE "type" = 'STARTED'
  GROUP BY "ticket_id"
) AS a
WHERE r."ticket_id" = a."ticket_id"
  AND r."started_at" IS NULL;
