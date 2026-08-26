import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import {
  listAllTickets,
  listAssignableUsers,
  listIssueReporters,
  type TicketFilters,
} from "@/lib/db/queries";
import { ticketTabFromParam } from "@/lib/ticket-tabs";
import { DEPARTMENTS, PRIORITIES } from "@/lib/validators/ticket";
import { AllTicketsView } from "@/components/dashboard/all-tickets-view";
import { ScopeToggle } from "@/components/dashboard/scope-toggle";
import { TicketSearch } from "@/components/dashboard/ticket-search";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "All Issues" };

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
  const reporter = pick(sp.reporter);
  // Facet filters only (department / priority / assignee / reporter / search).
  // The status tabs are applied client-side in <AllTicketsView> so switching is
  // instant.
  const filters: TicketFilters = {
    department: oneOf(pick(sp.department), DEPARTMENTS),
    priority: oneOf(pick(sp.priority), PRIORITIES),
    assigneeId:
      assignee === "unassigned"
        ? "unassigned"
        : assignee && /^[0-9a-f-]{36}$/i.test(assignee)
          ? assignee
          : undefined,
    reporterId:
      reporter && /^[0-9a-f-]{36}$/i.test(reporter) ? reporter : undefined,
    search: pick(sp.q)?.trim() || undefined,
  };

  const [tickets, users, reporters] = await Promise.all([
    listAllTickets(filters),
    listAssignableUsers(),
    listIssueReporters(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="All Issues">
        {/* On mobile the search sits next to the Table/Board toggle; on desktop it
            moves down next to the filter dropdowns (rendered in the toolbar). */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Which pipeline — issues here, or jump to the system-request list. */}
          <ScopeToggle />
          <ViewToggle />
          <TicketSearch className="min-w-0 flex-1 sm:hidden" />
        </div>
      </PageHeader>
      <AllTicketsView
        tickets={tickets}
        users={users}
        reporters={reporters}
        currentUser={user}
        initialTab={ticketTabFromParam(pick(sp.tab))}
      />
    </div>
  );
}
