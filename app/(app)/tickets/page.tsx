import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import {
  listAllTickets,
  listAssignableUsers,
  type TicketFilters,
} from "@/lib/db/queries";
import { statusesForTab, ticketTabFromParam } from "@/lib/ticket-tabs";
import { DEPARTMENTS, PRIORITIES } from "@/lib/validators/ticket";
import { TableToolbar } from "@/components/dashboard/table-toolbar";
import { TicketTable } from "@/components/dashboard/ticket-table";
import { TicketTabs } from "@/components/dashboard/ticket-tabs";
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

  // Status sub-tab (Open / In Progress / Resolved) → a set of statuses to match.
  const tab = ticketTabFromParam(pick(sp.tab));

  const assignee = pick(sp.assignee);
  const filters: TicketFilters = {
    department: oneOf(pick(sp.department), DEPARTMENTS),
    statuses: statusesForTab(tab),
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

      {/* Tabs + search + facet filters, all on one row (wraps on small screens). */}
      <div className="flex flex-wrap items-center gap-3">
        <TicketTabs />
        <div className="min-w-[240px] flex-1">
          <TableToolbar users={users} />
        </div>
      </div>
      <TicketTable tickets={tickets} users={users} currentUser={user} />
    </div>
  );
}
