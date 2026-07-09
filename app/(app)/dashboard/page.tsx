import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import {
  dashboardStats,
  listAllTickets,
  listAssignableUsers,
  ticketTrend,
  type TicketFilters,
} from "@/lib/db/queries";
import { DEPARTMENTS, PRIORITIES, STATUSES } from "@/lib/validators/ticket";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { StatusBreakdown } from "@/components/dashboard/status-breakdown";
import { TableToolbar } from "@/components/dashboard/table-toolbar";
import { TicketTable } from "@/components/dashboard/ticket-table";
import { TicketTrendChart } from "@/components/dashboard/ticket-trend-chart";
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

  const [stats, trend, tickets, users] = await Promise.all([
    dashboardStats(),
    ticketTrend(30),
    listAllTickets(filters),
    listAssignableUsers(),
  ]);
  const trendTotal = trend.reduce((sum, d) => sum + d.created, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="All tickets across the group.">
        <ViewToggle />
      </PageHeader>

      <KpiCards stats={stats} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)] lg:col-span-2">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-sm font-semibold">Ticket volume</h2>
              <p className="text-xs text-text-muted">Created per day · last 30 days</p>
            </div>
            <div className="text-right">
              <div className="font-mono text-xl font-semibold tabular-nums">
                {trendTotal}
              </div>
              <div className="text-xs text-text-muted">in 30 days</div>
            </div>
          </div>
          <div className="mt-4">
            <TicketTrendChart data={trend} />
          </div>
        </section>

        <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
          <h2 className="font-display text-sm font-semibold">By status</h2>
          <StatusBreakdown stats={stats} />
        </section>
      </div>

      <div className="space-y-4">
        <TableToolbar users={users} />
        <TicketTable tickets={tickets} users={users} currentUser={user} />
      </div>
    </div>
  );
}
