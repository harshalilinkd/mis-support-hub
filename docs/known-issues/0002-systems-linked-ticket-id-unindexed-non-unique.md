# 0002 — `systems.linked_ticket_id` is unindexed and non-unique

**Status:** tracked, not fixed. Both fixes need a migration, which P16 excluded.
**Found by:** the P16 adversarial review.
**Impact today:** none observable (1 system, 1 request). Real at scale.

## What

`systems.linked_ticket_id` (CLAUDE.md §13.2) carries an FK to `tickets.id` but has
**no index** and **no unique constraint**. Postgres does not index FK columns
automatically. Two separate consequences follow.

### 1. Unindexed — the §13.5 flag seq-scans per row

`listRequests` and `getRequestByNumber` resolve the "system logged ✓ / not logged"
flag with a correlated subquery:

```sql
select s.code from systems s where s.linked_ticket_id = tickets.id limit 1
```

That predicate has no index to use, so every request row scans `systems`. The
`percentComplete` precedent it was modelled on does **not** have this problem —
`progress_logs.ticket_id` IS indexed (`progress_logs_ticket_id_idx`).

Cost is `requests × systems`. At today's numbers that is nothing; it degrades as the
directory grows, and the requests list is a hot page for MIS.

### 2. Non-unique — the flag can be non-deterministic

Nothing prevents two systems from being logged against the same request:
`createSystem` accepts any `linkedTicketId`, and the §13.5 prompt only hides itself
once *a* system exists. With two, the subquery's `limit 1` has **no `ORDER BY`**, so
which code the flag shows is whatever Postgres returns first — it can change between
queries with no data change.

## Fix (when someone picks this up)

One migration covers both:

```sql
-- Deduplicate first if any request already has two systems, or this will fail.
CREATE UNIQUE INDEX "systems_linked_ticket_id_key"
  ON "systems" ("linked_ticket_id")
  WHERE "linked_ticket_id" IS NOT NULL;
```

A **partial** unique index is the right shape: `linked_ticket_id` is nullable (most
systems aren't built from a request), and Postgres treats NULLs as distinct — but the
partial predicate states the intent and keeps the index small. It also serves the
lookup, so a separate non-unique index is unnecessary.

Reflect the constraint into CLAUDE.md §13.2 at the same time, and consider whether
`createSystem` should return a friendly error when a request already has a system
rather than surfacing a unique-violation.

## Why it wasn't fixed in P16

P16 was scoped "no schema changes; do not run db:migrate". Adding an index is a
schema change and needs a migration the user applies against their Neon branch. It is
not urgent: the flag is correct today, and the scan is trivial at current volume.
