import type { Status } from "@/lib/db/schema";

/**
 * Status sub-tabs for the ticket tables. Pure module (no "use client") so both
 * the server page (query) and the client tab bar share one source of truth —
 * importing a plain helper from a "use client" file into a Server Component would
 * turn it into an uncallable client reference.
 *
 * Issue lifecycle tabs:
 *  - All         → every ticket, any status
 *  - Open        → raised, not claimed yet (OPEN, unassigned)
 *  - Claimed     → an MIS member took it but hasn't started (OPEN, assigned)
 *  - In Progress → started / being worked on (IN_PROGRESS, REOPENED)
 *  - Resolved    → fixed, awaiting the reporter's confirmation (RESOLVED)
 *  - Closed      → confirmed & closed for good (CLOSED)
 *
 * "Open" and "Claimed" both sit on the OPEN status and split by whether the
 * ticket has an assignee (§5: a claim assigns the ticket but leaves it OPEN until
 * it is started). A tab is therefore NOT a pure status set — use
 * `matchesTicketTab`, which sees the assignee.
 */
export const TICKET_TABS = [
  { key: "all", label: "All" },
  { key: "open", label: "Open" },
  { key: "claimed", label: "Claimed" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
] as const;

export type TicketTabKey = (typeof TICKET_TABS)[number]["key"];

const TAB_KEYS: readonly string[] = TICKET_TABS.map((t) => t.key);

/** Parse the `?tab=` param into a valid tab key (defaults to "open"). */
export function ticketTabFromParam(value: string | undefined): TicketTabKey {
  return TAB_KEYS.includes(value ?? "") ? (value as TicketTabKey) : "open";
}

/**
 * Does a ticket row belong under this tab? Assignee-aware, so it can tell an
 * unclaimed OPEN ticket (Open) from a claimed-but-unstarted one (Claimed) — the
 * one distinction a pure status set can't make (§5).
 */
export function matchesTicketTab(
  tab: TicketTabKey,
  row: { status: Status; assignedToId: string | null }
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "open":
      return row.status === "OPEN" && !row.assignedToId;
    case "claimed":
      return row.status === "OPEN" && !!row.assignedToId;
    case "in_progress":
      return row.status === "IN_PROGRESS" || row.status === "REOPENED";
    case "resolved":
      return row.status === "RESOLVED";
    case "closed":
      return row.status === "CLOSED";
  }
}
