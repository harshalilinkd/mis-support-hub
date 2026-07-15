import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import { createdByDepartment, flowTrend, openAging } from "@/lib/db/analytics";
import { dashboardStats, listAllTickets } from "@/lib/db/queries";
import type { Department } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { ChartAgingBar } from "@/components/dashboard/chart-aging-bar";
import { ChartCreatedResolved } from "@/components/dashboard/chart-created-resolved";
import { ChartDepartmentBar } from "@/components/dashboard/chart-department-bar";
import { ChartPriorityStacked } from "@/components/dashboard/chart-priority-stacked";
import { ChartResolutionLine } from "@/components/dashboard/chart-resolution-line";
import { ChartStatusDonut } from "@/components/dashboard/chart-status-donut";
import { KpiCards, type KpiSparks } from "@/components/dashboard/kpi-cards";
import { DashboardFilters } from "@/components/dashboard/dashboard-filters";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };

type SearchParams = Record<string, string | string[] | undefined>;
const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Aging buckets — labels match openAging()'s keys, on a fresh→stale severity ramp.
const AGING = [
  { key: "0", label: "0–1d", color: "var(--status-resolved)" },
  { key: "1", label: "1–3d", color: "var(--priority-medium)" },
  { key: "2", label: "3–7d", color: "var(--priority-high)" },
  { key: "3", label: "7d+", color: "var(--priority-urgent)" },
] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** Start of `d`'s calendar day (local server time). */
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Whole days between two day-starts (a − b), positive when a is later. */
function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** Count rows into `days` daily buckets (oldest → newest) by the row's date. */
function dailyCount<T>(rows: T[], days: number, today: Date, dateOf: (r: T) => Date | null | undefined): number[] {
  const out = new Array<number>(days).fill(0);
  for (const r of rows) {
    const d = dateOf(r);
    if (!d) continue;
    const ago = daysBetween(today, startOfDay(new Date(d)));
    if (ago >= 0 && ago < days) out[days - 1 - ago] += 1;
  }
  return out;
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

  const [stats, flow, byDept, aging, allTickets] = await Promise.all([
    dashboardStats(),
    flowTrend(30, department), // Chart 1 is pinned to the last 30 days.
    createdByDepartment(days),
    openAging(department),
    // Raw list (existing query) → derive the weekly/daily charts client-of-server-side.
    listAllTickets(department ? { department } : {}),
  ]);

  const now = new Date();
  const today = startOfDay(now);

  /* ---- Chart 2 · open tickets by status (donut) ---- */
  const statusData = [
    { key: "OPEN", name: "Open", value: stats.open, color: "var(--status-open)" },
    { key: "IN_PROGRESS", name: "In Progress", value: stats.inProgress, color: "var(--status-in-progress)" },
    { key: "RESOLVED", name: "Resolved", value: stats.resolved, color: "var(--status-resolved)" },
  ];

  /* ---- Chart 3 · tickets by department (horizontal bar) ---- */
  const deptData = DEPARTMENTS.map((d) => ({
    name: DEPARTMENT_LABELS[d],
    value: byDept.find((x) => x.department === d)?.count ?? 0,
  }));

  /* ---- Chart 4 · priority across the last 4 weeks (stacked) ---- */
  const priorityWeeks = Array.from({ length: 4 }, (_, i) => {
    const weekIdx = 3 - i; // 0 = most recent
    const start = new Date(today);
    start.setDate(today.getDate() - 7 * (weekIdx + 1) + 1);
    const finish = new Date(today);
    finish.setDate(today.getDate() - 7 * weekIdx);
    finish.setHours(23, 59, 59, 999);
    const row = { week: fmtDate(start), LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
    for (const t of allTickets) {
      if (!t.priority) continue;
      const c = new Date(t.createdAt);
      if (c >= start && c <= finish) row[t.priority] += 1;
    }
    return row;
  });

  /* ---- Chart 5 · avg resolution hours per week, last 8 weeks (line) ---- */
  const resolutionWeeks = Array.from({ length: 8 }, (_, i) => {
    const weekIdx = 7 - i; // 0 = most recent
    const start = new Date(today);
    start.setDate(today.getDate() - 7 * (weekIdx + 1) + 1);
    const finish = new Date(today);
    finish.setDate(today.getDate() - 7 * weekIdx);
    finish.setHours(23, 59, 59, 999);
    let sum = 0;
    let count = 0;
    for (const t of allTickets) {
      if (!t.resolvedAt) continue;
      const r = new Date(t.resolvedAt);
      if (r >= start && r <= finish) {
        sum += (r.getTime() - new Date(t.createdAt).getTime()) / 3_600_000;
        count += 1;
      }
    }
    return { week: fmtDate(start), hours: count ? Number((sum / count).toFixed(1)) : null };
  });

  /* ---- Chart 6 · open-ticket aging (columns) ---- */
  const agingData = AGING.map((a) => ({
    name: a.label,
    value: aging.find((x) => x.key === a.key)?.count ?? 0,
    color: a.color,
  }));

  /* ---- KPI sparklines · 14-day daily trends from the ticket list ---- */
  const SPARK_DAYS = 14;
  const resolvedRows = allTickets.filter((t) => t.resolvedAt);
  const sparks: KpiSparks = {
    open: dailyCount(allTickets.filter((t) => t.status === "OPEN"), SPARK_DAYS, today, (t) => t.createdAt),
    inProgress: dailyCount(
      allTickets.filter((t) => t.status === "IN_PROGRESS" || t.status === "REOPENED"),
      SPARK_DAYS,
      today,
      (t) => t.createdAt
    ),
    unassigned: dailyCount(
      allTickets.filter((t) => !t.assignedToId && t.status !== "CLOSED"),
      SPARK_DAYS,
      today,
      (t) => t.createdAt
    ),
    resolvedLast7d: dailyCount(resolvedRows, SPARK_DAYS, today, (t) => t.resolvedAt),
    closed: dailyCount(
      allTickets.filter((t) => t.status === "CLOSED"),
      SPARK_DAYS,
      today,
      (t) => t.resolvedAt ?? t.createdAt
    ),
    avgResolution: (() => {
      const sum = new Array<number>(SPARK_DAYS).fill(0);
      const cnt = new Array<number>(SPARK_DAYS).fill(0);
      for (const t of resolvedRows) {
        const r = new Date(t.resolvedAt!);
        const ago = daysBetween(today, startOfDay(r));
        if (ago >= 0 && ago < SPARK_DAYS) {
          const idx = SPARK_DAYS - 1 - ago;
          sum[idx] += (r.getTime() - new Date(t.createdAt).getTime()) / 3_600_000;
          cnt[idx] += 1;
        }
      }
      return sum.map((s, i) => (cnt[i] ? Number((s / cnt[i]).toFixed(1)) : 0));
    })(),
  };

  const createdInRange = flow.reduce((sum, d) => sum + d.created, 0);
  const resolvedInRange = flow.reduce((sum, d) => sum + d.resolved, 0);
  const rangeLabel = `last ${days} days`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Insights across the group — volumes, status mix, and workload."
      >
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <DashboardFilters />
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/tickets" aria-label="View all tickets">
              <span className="hidden sm:inline">View all tickets</span>
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </PageHeader>

      <KpiCards stats={stats} sparks={sparks} />

      {/* Six-chart bento — varied forms, one card radius/shadow, staggered entrance. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        <Panel
          title="Created vs resolved"
          subtitle={`${createdInRange} in · ${resolvedInRange} out · last 30 days`}
          className="md:col-span-2 lg:col-span-4"
          delay={0}
        >
          <ChartCreatedResolved data={flow} />
        </Panel>

        <Panel
          title="Open tickets by status"
          subtitle="Open · In Progress · Resolved"
          className="md:col-span-1 lg:col-span-2"
          delay={60}
        >
          <ChartStatusDonut data={statusData} />
        </Panel>

        <Panel
          title="By department"
          subtitle={`Created · ${rangeLabel}`}
          className="md:col-span-1 lg:col-span-3"
          delay={120}
        >
          <ChartDepartmentBar data={deptData} />
        </Panel>

        <Panel
          title="By priority"
          subtitle="Created · last 4 weeks"
          className="md:col-span-1 lg:col-span-3"
          delay={180}
        >
          <ChartPriorityStacked data={priorityWeeks} />
        </Panel>

        <Panel
          title="Avg resolution time"
          subtitle="Hours · last 8 weeks"
          className="md:col-span-1 lg:col-span-4"
          delay={240}
        >
          <ChartResolutionLine data={resolutionWeeks} />
        </Panel>

        <Panel
          title="Open ticket aging"
          subtitle="Active tickets by age"
          className="md:col-span-2 lg:col-span-2"
          delay={300}
        >
          <ChartAgingBar data={agingData} />
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  className,
  delay = 0,
  children,
}: {
  title: string;
  subtitle?: string;
  className?: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{ animationDelay: `${delay}ms` }}
      className={cn(
        "enter-up rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)] transition-[box-shadow,border-color] duration-200 hover:border-primary/20 hover:shadow-[var(--shadow-hover)]",
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
