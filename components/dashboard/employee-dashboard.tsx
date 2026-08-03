import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  CircleDot,
  Gauge,
  Inbox,
  PlusCircle,
  Sparkles,
  Timer,
} from "lucide-react";

import { listMyTickets, listRequests } from "@/lib/db/queries";
import type { Status } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shell/empty-state";
import { ChartAgingBar } from "./chart-aging-bar";
import { ChartCreatedResolved } from "./chart-created-resolved";
import { ChartDepartmentBar } from "./chart-department-bar";
import { ChartStatusDonut } from "./chart-status-donut";

const FLOW_DAYS = 30;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * The employee's landing dashboard (§3) — interactive: KPI cards deep-link into a
 * filtered My Tickets view, and four charts summarise their own issues & requests.
 * All figures derive from their OWN rows (row-scoped queries), no new queries (§10).
 */
export async function EmployeeDashboard({ userId }: { userId: string }) {
  const [issues, requests] = await Promise.all([
    listMyTickets(userId),
    listRequests({ id: userId, role: "USER" }),
  ]);

  const has = (arr: Status[], s: Status) => arr.includes(s);
  const issueCount = (ss: Status[]) => issues.filter((t) => ss.includes(t.status)).length;
  const reqCount = (ss: Status[]) => requests.filter((r) => ss.includes(r.status)).length;

  const open = issueCount(["OPEN"]);
  const inProgress = issueCount(["IN_PROGRESS", "REOPENED"]);
  const resolvedToConfirm = issueCount(["RESOLVED"]);
  const activeRequests = requests.filter(
    (r) => !has(["CLOSED", "DROPPED"], r.status)
  ).length;

  const nothingYet = issues.length === 0 && requests.length === 0;

  // Each card deep-links to the matching filtered My Tickets view (client tabs read
  // the ?scope=&tab= params). One card → one clean filter.
  const stats = [
    {
      label: "Open",
      value: open,
      hint: "waiting to be picked up",
      icon: CircleDot,
      href: "/my?scope=issues&tab=open",
    },
    {
      label: "In progress",
      value: inProgress,
      hint: "being worked on",
      icon: Timer,
      href: "/my?scope=issues&tab=in_progress",
    },
    {
      label: "Needs your review",
      value: resolvedToConfirm,
      hint: "resolved fixes to confirm",
      icon: Inbox,
      href: "/my?scope=issues&tab=resolved",
      highlight: true,
    },
    {
      label: "System requests",
      value: activeRequests,
      hint: "in the pipeline",
      icon: Sparkles,
      href: "/my?scope=systems",
    },
  ];

  /* Chart 1 · my issues by status (donut) */
  const issueStatusData = [
    { key: "OPEN", name: "Open", value: issueCount(["OPEN"]), color: "var(--status-open)" },
    { key: "IN_PROGRESS", name: "In progress", value: issueCount(["IN_PROGRESS", "REOPENED"]), color: "var(--status-in-progress)" },
    { key: "RESOLVED", name: "Resolved", value: issueCount(["RESOLVED"]), color: "var(--status-resolved)" },
    { key: "CLOSED", name: "Closed", value: issueCount(["CLOSED"]), color: "var(--text-muted)" },
  ];

  /* Chart 2 · my issues over time — raised vs resolved, last 30 days (area).
     Answers "are my issues getting handled as fast as I raise them?" */
  const today = startOfDay(new Date());
  const flow = Array.from({ length: FLOW_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (FLOW_DAYS - 1 - i));
    return { date: d.toISOString(), created: 0, resolved: 0 };
  });
  const bucket = (value: Date | string) => {
    const d = startOfDay(new Date(value));
    const ago = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    return FLOW_DAYS - 1 - ago;
  };
  for (const t of issues) {
    const ci = bucket(t.createdAt);
    if (ci >= 0 && ci < FLOW_DAYS) flow[ci].created += 1;
    if (t.resolvedAt) {
      const ri = bucket(t.resolvedAt);
      if (ri >= 0 && ri < FLOW_DAYS) flow[ri].resolved += 1;
    }
  }

  /* Chart 3 · my requests by stage (columns) */
  const requestStageData = [
    { name: "Awaiting", value: reqCount(["SUBMITTED", "UNDER_REVIEW", "PENDING_MD_APPROVAL"]), color: "var(--status-open)" },
    { name: "Approved", value: reqCount(["APPROVED", "CLAIMED"]), color: "var(--priority-medium)" },
    { name: "Building", value: reqCount(["IN_PROGRESS", "CHANGES_REQUESTED"]), color: "var(--status-in-progress)" },
    { name: "Testing", value: reqCount(["IN_TESTING"]), color: "var(--priority-high)" },
    { name: "Closed", value: reqCount(["CLOSED"]), color: "var(--status-resolved)" },
  ];

  /* Chart 4 · how far along my in-flight builds are (% complete per request). */
  const requestProgress = requests
    .filter(
      (r) =>
        has(["IN_PROGRESS", "CHANGES_REQUESTED", "IN_TESTING"], r.status) &&
        r.percentComplete != null
    )
    .map((r) => ({ name: r.systemName, value: r.percentComplete as number }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Your issues and system requests at a glance."
      >
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button asChild size="sm" variant="outline" className="shrink-0">
            <Link href="/new">
              <PlusCircle className="size-4" /> Report an issue
            </Link>
          </Button>
          <Button asChild size="sm" className="shrink-0">
            <Link href="/requests/new">
              <Sparkles className="size-4" /> Request a new system
            </Link>
          </Button>
        </div>
      </PageHeader>

      {nothingYet ? (
        <EmptyState
          icon={<Inbox className="size-5" />}
          title="Nothing raised yet"
          description="When you report an issue or request a system, you'll see its status and progress here."
          actionHref="/new"
          actionLabel="Report an issue"
        />
      ) : (
        <>
          {/* KPI row — each card links to its filtered My Tickets view */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                className={cn(
                  "group rounded-[var(--radius-card)] border bg-surface p-4 shadow-[var(--shadow-elevation)] transition-[box-shadow,border-color] hover:shadow-[var(--shadow-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  s.highlight && s.value > 0
                    ? "border-primary/40 hover:border-primary/60"
                    : "border-border hover:border-primary/20"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-text-muted">{s.label}</span>
                  <span
                    className={cn(
                      "grid size-7 place-items-center rounded-[var(--radius-input)]",
                      s.highlight && s.value > 0
                        ? "bg-accent-soft text-primary"
                        : "bg-surface-muted text-text-muted"
                    )}
                  >
                    <s.icon className="size-4" />
                  </span>
                </div>
                <div className="mt-2 font-display text-3xl font-semibold tabular-nums">
                  {s.value}
                </div>
                <p className="mt-0.5 flex items-center gap-0.5 text-xs text-text-muted">
                  {s.hint}
                  <ChevronRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
                </p>
              </Link>
            ))}
          </div>

          {/* Four charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="My issues by status" subtitle={`${issues.length} total`}>
              <ChartStatusDonut data={issueStatusData} />
            </Panel>
            <Panel title="My issues over time" subtitle="Raised vs resolved · last 30 days">
              <ChartCreatedResolved data={flow} />
            </Panel>
            <Panel title="My requests by stage" subtitle={`${requests.length} total`}>
              <ChartAgingBar data={requestStageData} />
            </Panel>
            <Panel
              title="My requests in progress"
              subtitle="How far along each build is"
              icon={<Gauge className="size-4" />}
            >
              {requestProgress.length > 0 ? (
                <ChartDepartmentBar data={requestProgress} />
              ) : (
                <p className="mt-8 text-center text-sm text-text-muted">
                  No builds in progress right now.
                </p>
              )}
            </Panel>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/my">
                View all my tickets <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
      <div className="flex items-center gap-2">
        {icon ? <span className="text-text-muted">{icon}</span> : null}
        <div>
          <h2 className="font-display text-sm font-semibold">{title}</h2>
          {subtitle ? <p className="text-xs text-text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}
