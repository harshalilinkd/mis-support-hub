import Link from "next/link";
import {
  ArrowRight,
  CircleDot,
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
import { ChartStatusDonut } from "./chart-status-donut";

/**
 * The employee's landing dashboard (§3). Everyone opens on /dashboard; a USER gets
 * this "your issues & requests at a glance" view instead of the staff operational one
 * they can't access. All figures are derived here from their OWN rows (listMyTickets +
 * listRequests, which row-scope a USER to what they raised) — no new queries (§10).
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
  // Things that need the employee to act: resolved issues to confirm + delivered
  // builds to test/accept.
  const needsReview =
    issueCount(["RESOLVED"]) + reqCount(["IN_TESTING"]);
  const activeRequests = requests.filter(
    (r) => !has(["CLOSED", "DROPPED"], r.status)
  ).length;

  const nothingYet = issues.length === 0 && requests.length === 0;

  const stats = [
    {
      label: "Open",
      value: open,
      hint: "waiting to be picked up",
      icon: CircleDot,
    },
    {
      label: "In progress",
      value: inProgress,
      hint: "being worked on",
      icon: Timer,
    },
    {
      label: "Needs your review",
      value: needsReview,
      hint: "resolved fixes & delivered builds to confirm",
      icon: Inbox,
      highlight: true,
    },
    {
      label: "System requests",
      value: activeRequests,
      hint: "in the pipeline",
      icon: Sparkles,
    },
  ];

  /* My issues by status (donut) */
  const issueStatusData = [
    { key: "OPEN", name: "Open", value: issueCount(["OPEN"]), color: "var(--status-open)" },
    { key: "IN_PROGRESS", name: "In progress", value: issueCount(["IN_PROGRESS", "REOPENED"]), color: "var(--status-in-progress)" },
    { key: "RESOLVED", name: "Resolved", value: issueCount(["RESOLVED"]), color: "var(--status-resolved)" },
    { key: "CLOSED", name: "Closed", value: issueCount(["CLOSED"]), color: "var(--text-muted)" },
  ];

  /* My requests by stage (columns) */
  const requestStageData = [
    { name: "Awaiting", value: reqCount(["SUBMITTED", "UNDER_REVIEW", "PENDING_MD_APPROVAL"]), color: "var(--status-open)" },
    { name: "Approved", value: reqCount(["APPROVED", "CLAIMED"]), color: "var(--priority-medium)" },
    { name: "Building", value: reqCount(["IN_PROGRESS", "CHANGES_REQUESTED"]), color: "var(--status-in-progress)" },
    { name: "Testing", value: reqCount(["IN_TESTING"]), color: "var(--priority-high)" },
    { name: "Closed", value: reqCount(["CLOSED"]), color: "var(--status-resolved)" },
  ];

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
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className={cn(
                  "rounded-[var(--radius-card)] border bg-surface p-4 shadow-[var(--shadow-elevation)]",
                  s.highlight && s.value > 0
                    ? "border-primary/40"
                    : "border-border"
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
                <p className="mt-0.5 text-xs text-text-muted">{s.hint}</p>
              </div>
            ))}
          </div>

          {/* Two compact charts */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel title="My issues by status" subtitle={`${issues.length} total`}>
              <ChartStatusDonut data={issueStatusData} />
            </Panel>
            <Panel title="My requests by stage" subtitle={`${requests.length} total`}>
              <ChartAgingBar data={requestStageData} />
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
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
      <div>
        <h2 className="font-display text-sm font-semibold">{title}</h2>
        {subtitle ? <p className="text-xs text-text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}
