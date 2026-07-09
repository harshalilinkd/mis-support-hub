import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import {
  dashboardStats,
  listAllTickets,
  listAssignableUsers,
  type TicketFilters,
} from "@/lib/db/queries";
import { ticketFiltersSchema } from "@/lib/validators/ticket";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { TableToolbar } from "@/components/dashboard/table-toolbar";
import { TicketTable } from "@/components/dashboard/ticket-table";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Record<string, string | string[] | undefined>;

const pick = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requireRole(...STAFF_ROLES);
  const sp = await searchParams;

  const parsed = ticketFiltersSchema.safeParse({
    department: pick(sp.department),
    status: pick(sp.status),
    priority: pick(sp.priority),
    assigneeId: pick(sp.assignee),
    search: pick(sp.q),
  });
  const filters: TicketFilters = parsed.success ? parsed.data : {};

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
