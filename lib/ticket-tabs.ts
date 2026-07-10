import type { Status } from "@/lib/db/schema";

/**
 * Status sub-tabs for the All Tickets view. Pure module (no "use client") so both
 * the server page (query) and the client tab bar share one source of truth —
 * importing a plain helper from a "use client" file into a Server Component would
 * turn it into an uncallable client reference.
 *
 *  - Open        → raised, not claimed yet (OPEN)
 *  - In Progress → claimed and being worked on (IN_PROGRESS, REOPENED)
 *  - Resolved    → done (RESOLVED, CLOSED)
 *
 * Every status maps to exactly one tab, so there is no "all" catch-all.
 */
export const TICKET_TABS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
] as const;

export type TicketTabKey = (typeof TICKET_TABS)[number]["key"];

/** Parse the `?tab=` param into a valid tab key (defaults to "open"). */
export function ticketTabFromParam(value: string | undefined): TicketTabKey {
  return value === "in_progress" || value === "resolved" ? value : "open";
}

/** Statuses matched by a tab. Every tab constrains status — there is no "all". */
export function statusesForTab(tab: TicketTabKey): Status[] {
  switch (tab) {
    case "in_progress":
      return ["IN_PROGRESS", "REOPENED"];
    case "resolved":
      return ["RESOLVED", "CLOSED"];
    case "open":
    default:
      return ["OPEN"];
  }
}
