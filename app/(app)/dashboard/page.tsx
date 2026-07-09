import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import {
  assigneeWorkload,
  createdByDepartment,
  createdByPriority,
  flowTrend,
  openAging,
} from "@/lib/db/analytics";
import { dashboardStats } from "@/lib/db/queries";
import type { Department } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import {
  DEPARTMENTS,
  DEPARTMENT_LABELS,
  PRIORITIES,
} from "@/lib/validators/ticket";
import { BarList } from "@/components/dashboard/bar-list";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { FlowChart } from "@/components/dashboard/flow-chart";
import { KpiCards } from "@/components/dashboard/kpi-cards";
import { StatusBreakdown } from "@/components/dashboard/status-breakdown";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Record<string, string | string[] | undefined>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};
const PRIORITY_COLOR: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "var(--priority-low)",
  MEDIUM: "var(--priority-medium)",
  HIGH: "var(--priority-high)",
  URGENT: "var(--priority-urgent)",
};
const AGING = [
  { key: "0", label: "Under 1 day", color: "var(--status-resolved)" },
  { key: "1", label: "1–3 days", color: "var(--priority-medium)" },
  { key: "2", label: "3–7 days", color: "var(--priority-high)" },
  { key: "3", label: "Over 7 days", color: "var(--priority-urgent)" },
] as const;

function Panel({
  title,
  subtitle,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]",
        className
      )}
    >
      <div>
        <h2 className="font-display text-sm font-semibold">{title}</h2>
        {subtitle ? <p className="text-xs text-text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(...STAFF_ROLES);
  const sp = await searchParams;

  const rangeParam = pick(sp.range);
  const days = rangeParam === "7" ? 7 : rangeParam === "90" ? 90 : 30;
  const deptParam = pick(sp.department);
  const department = (DEPARTMENTS as readonly string[]).includes(deptParam ?? "")
    ? (deptParam as Department)
    : undefined;

  const [stats, flow, byDept, byPriority, aging, workload] = await Promise.all([
    dashboardStats(),
    flowTrend(days, department),
    createdByDepartment(days),
    createdByPriority(days, department),
    openAging(department),
    assigneeWorkload(department),
  ]);

  const createdInRange = flow.reduce((sum, d) => sum + d.created, 0);
  const resolvedInRange = flow.reduce((sum, d) => sum + d.resolved, 0);

  const deptItems = DEPARTMENTS.map((d) => ({
    label: DEPARTMENT_LABELS[d],
    value: byDept.find((x) => x.department === d)?.count ?? 0,
  }));
  const priorityItems = PRIORITIES.map((p) => ({
    label: PRIORITY_LABELS[p],
    value: byPriority.find((x) => x.priority === p)?.count ?? 0,
    color: PRIORITY_COLOR[p],
  }));
  const agingItems = AGING.map((a) => ({
    label: a.label,
    value: aging.find((x) => x.key === a.key)?.count ?? 0,
    color: a.color,
  }));
  const workloadItems = workload.map((w) => ({
    id: w.id,
    label: w.name ?? "Unnamed",
    value: w.count,
  }));

  const rangeLabel = `last ${days} days`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Insights across the group — volumes, status mix, and workload."
      >
        <DashboardFilters />
        <Button asChild variant="outline" size="sm">
          <Link href="/tickets">
            View all tickets <ArrowRight className="size-4" />
          </Link>
        </Button>
      </PageHeader>

      <KpiCards stats={stats} />

      {/* Flow + status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Created vs resolved"
          subtitle={`${createdInRange} in · ${resolvedInRange} out · ${rangeLabel}`}
          className="lg:col-span-2"
        >
          <FlowChart data={flow} />
        </Panel>
        <Panel title="By status" subtitle="Current, all-time">
          <StatusBreakdown stats={stats} />
        </Panel>
      </div>

      {/* Department + priority + aging */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Panel title="By department" subtitle={`Created · ${rangeLabel}`}>
          <BarList
            items={deptItems}
            totalLabel={(t) => `${t} ${t === 1 ? "ticket" : "tickets"} in range`}
          />
        </Panel>
        <Panel title="By priority" subtitle={`Created · ${rangeLabel}`}>
          <BarList items={priorityItems} />
        </Panel>
        <Panel title="Open ticket aging" subtitle="Active tickets by age">
          <BarList items={agingItems} emptyLabel="No open tickets right now." />
        </Panel>
      </div>

      {/* Workload */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel
          title="Workload by assignee"
          subtitle="Active tickets per MIS member"
          className="lg:col-span-2"
        >
          <BarList
            items={workloadItems}
            emptyLabel="No active assignments right now."
          />
        </Panel>
      </div>
    </div>
  );
}
