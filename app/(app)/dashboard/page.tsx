import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import {
  dashboardStats,
  listAllTickets,
  listAssignableUsers,
  type TicketFilters,
} from "@/lib/db/queries";
import { DEPARTMENTS, PRIORITIES, STATUSES } from "@/lib/validators/ticket";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { TableToolbar } from "@/components/dashboard/table-toolbar";
import { TicketTable } from "@/components/dashboard/ticket-table";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Dashboard" };

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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireRole(...STAFF_ROLES);
  const sp = await searchParams;

  // Parse each facet independently so one malformed param no-ops only itself.
  const assignee = pick(sp.assignee);
  const filters: TicketFilters = {
    department: oneOf(pick(sp.department), DEPARTMENTS),
    status: oneOf(pick(sp.status), STATUSES),
    priority: oneOf(pick(sp.priority), PRIORITIES),
    assigneeId:
      assignee === "unassigned"
        ? "unassigned"
        : assignee && /^[0-9a-f-]{36}$/i.test(assignee)
          ? assignee
          : undefined,
    search: pick(sp.q)?.trim() || undefined,
  };

  const [stats, tickets, users] = await Promise.all([
    dashboardStats(),
    listAllTickets(filters),
    listAssignableUsers(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="All tickets across the group.">
        <ViewToggle />
      </PageHeader>
      <KpiCards stats={stats} />
      <TableToolbar users={users} />
      <TicketTable tickets={tickets} users={users} currentUser={user} />
    </div>
  );
}
