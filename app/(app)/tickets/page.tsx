import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import {
  listAllTickets,
  listAssignableUsers,
  type TicketFilters,
} from "@/lib/db/queries";
import { ticketTabFromParam } from "@/lib/ticket-tabs";
import { DEPARTMENTS, PRIORITIES } from "@/lib/validators/ticket";
import { AllTicketsView } from "@/components/dashboard/all-tickets-view";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "All Tickets" };

type SearchParams = Record<string, string | string[] | undefined>;

const pick = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

function oneOf<T extends readonly string[]>(
  value: string | undefined,
  allowed: T
): T[number] | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T[number])
    : undefined;
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireRole(...STAFF_ROLES);
  const sp = await searchParams;

  const assignee = pick(sp.assignee);
  // Facet filters only (department / priority / assignee / search). The status
  // tabs are applied client-side in <AllTicketsView> so switching is instant.
  const filters: TicketFilters = {
    department: oneOf(pick(sp.department), DEPARTMENTS),
    priority: oneOf(pick(sp.priority), PRIORITIES),
    assigneeId:
      assignee === "unassigned"
        ? "unassigned"
        : assignee && /^[0-9a-f-]{36}$/i.test(assignee)
          ? assignee
          : undefined,
    search: pick(sp.q)?.trim() || undefined,
  };

  const [tickets, users] = await Promise.all([
    listAllTickets(filters),
    listAssignableUsers(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="All Tickets"
        description="Every ticket across the group. Claim one to start working on it."
      >
        <ViewToggle />
      </PageHeader>
      <AllTicketsView
        tickets={tickets}
        users={users}
        currentUser={user}
        initialTab={ticketTabFromParam(pick(sp.tab))}
      />
    </div>
  );
}
