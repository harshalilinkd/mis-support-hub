import type { Status } from "@/lib/db/schema";

/**
 * Ticket lifecycle state machine (CLAUDE.md §5).
 *
 * OPEN → IN_PROGRESS → RESOLVED → CLOSED. From RESOLVED the reporter may reopen
 * → REOPENED (behaves like IN_PROGRESS). These are the transitions performed by
 * MIS via `updateStatus`; the RESOLVED → REOPENED move is handled separately by
 * `reopenTicket` (different permissions), so it is intentionally NOT listed here.
 *
 * This module is pure (type-only import) and safe to import from client UI.
 */
export const STATUS_TRANSITIONS: Record<Status, Status[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  REOPENED: ["IN_PROGRESS", "RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
};

export function canTransition(from: Status, to: Status): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses treated as "active work" (board columns / dashboard). */
export const ACTIVE_STATUSES: Status[] = ["OPEN", "IN_PROGRESS", "REOPENED"];

/** Days a RESOLVED ticket waits before auto-CLOSE (CLAUDE.md §5; cron in a later phase). */
export const AUTO_CLOSE_DAYS = 7;
