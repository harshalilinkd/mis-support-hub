import type { Status } from "@/lib/db/schema";
import { ACTIVE_STATUSES } from "@/lib/ticket-state";

/**
 * Status sub-tabs for the All Tickets view. Pure module (no "use client") so both
 * the server page (query) and the client tab bar share one source of truth —
 * importing a plain helper from a "use client" file into a Server Component would
 * turn it into an uncallable client reference.
 */
export const TICKET_TABS = [
  { key: "all", label: "All Tickets" },
  { key: "active", label: "Active" },
  { key: "resolved", label: "Resolved" },
] as const;

export type TicketTabKey = (typeof TICKET_TABS)[number]["key"];

/** Parse the `?tab=` param into a valid tab key (defaults to "all"). */
export function ticketTabFromParam(value: string | undefined): TicketTabKey {
  return value === "active" || value === "resolved" ? value : "all";
}

/** Statuses matched by a tab; `undefined` means no status constraint (All). */
export function statusesForTab(tab: TicketTabKey): Status[] | undefined {
  if (tab === "active") return ACTIVE_STATUSES;
  if (tab === "resolved") return ["RESOLVED", "CLOSED"];
  return undefined;
}
