"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Library, Search, Sparkles, X } from "lucide-react";

import { AbsoluteTime } from "@/components/absolute-time";
import { EmptyState } from "@/components/shell/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FacetSelect, FACET_ALL } from "@/components/dashboard/facet-select";
import type { RequestListRow } from "@/lib/db/queries";
import type { Status } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { TabScroller } from "@/components/shell/tab-scroller";
import { formatDueDate, humanizeEnum } from "@/lib/format";
import {
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  PRIORITIES,
} from "@/lib/validators/ticket";
import { PriorityChip, statusColor } from "./chips";
import { RequestSheet } from "./request-sheet";
import { RequestStageControl } from "./request-stage-control";

type TabKey =
  | "all"
  | "awaiting"
  | "approved"
  | "claimed"
  | "in_progress"
  | "testing"
  | "closed"
  | "dropped";

/**
 * Stage tabs (§12.3). `statuses: null` = All. Every request stage lands in exactly
 * one tab.
 *
 * "In progress" means the build has genuinely STARTED — an assignee committed to a
 * delivery date via startWork (§12.3). Approved-but-unclaimed (Approved) and
 * claimed-but-not-started (Claimed) are NOT in progress — nobody has promised a date
 * yet — so each gets its own tab.
 *
 * CHANGES_REQUESTED belongs here: that build started long ago (it has a deadline and
 * has already been through testing) and is back in the build loop.
 */
const TABS: { key: TabKey; label: string; statuses: Status[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  {
    key: "awaiting",
    label: "Awaiting approval",
    statuses: ["SUBMITTED", "UNDER_REVIEW", "PENDING_MD_APPROVAL"],
  },
  { key: "approved", label: "Approved", statuses: ["APPROVED"] },
  { key: "claimed", label: "Claimed", statuses: ["CLAIMED"] },
  {
    key: "in_progress",
    label: "In progress",
    statuses: ["IN_PROGRESS", "CHANGES_REQUESTED"],
  },
  { key: "testing", label: "Testing", statuses: ["IN_TESTING"] },
  { key: "closed", label: "Closed", statuses: ["CLOSED"] },
  { key: "dropped", label: "Dropped", statuses: ["DROPPED"] },
];

const inTab = (tab: (typeof TABS)[number], row: RequestListRow) =>
  tab.statuses === null || tab.statuses.includes(row.status);

/**
 * §13.5 — "system logged ✓ / not logged". Only meaningful once the build is
 * finished: before that there is nothing to log, so an empty cell is the honest
 * answer rather than a nag on every row.
 */
function SystemLoggedCell({ row }: { row: RequestListRow }) {
  const finished =
    row.status === "IN_TESTING" ||
    row.status === "CLOSED" ||
    row.status === "CHANGES_REQUESTED";
  if (row.systemCode) {
    return (
      <Link
        href={`/systems/${row.systemCode}`}
        className="inline-flex items-center gap-1.5 rounded-sm font-mono text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CheckCircle2 className="size-3.5" />
        {row.systemCode}
      </Link>
    );
  }
  if (!finished) return <span className="text-sm text-text-muted">—</span>;
  return (
    <span
      title="This build isn't in the systems directory yet"
      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--priority-high)]"
    >
      <Library className="size-3.5" />
      Not logged
    </span>
  );
}

export function RequestsView({
  requests,
  currentUser,
}: {
  requests: RequestListRow[];
  currentUser: SessionUser;
}) {
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState(FACET_ALL);
  const [priority, setPriority] = useState(FACET_ALL);
  const [requester, setRequester] = useState(FACET_ALL);
  const [selected, setSelected] = useState<string | null>(null);

  // Requester options are the distinct people who appear in THIS list (all
  // requests, or just those assigned to me on /my) — derived from the rows, no
  // extra query, exactly like the issue table's Reporter facet.
  const requesterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const r of requests) {
      if (r.createdById) byId.set(r.createdById, r.createdByName ?? "—");
    }
    return [...byId]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [requests]);

  const hasFacets =
    dept !== FACET_ALL || priority !== FACET_ALL || requester !== FACET_ALL;

  const clearFacets = () => {
    setDept(FACET_ALL);
    setPriority(FACET_ALL);
    setRequester(FACET_ALL);
    setQuery("");
  };

  // Facets (dept / priority / requester) + search. Applied before the stage tabs
  // so the tab counts reflect the active facets, mirroring All Issues.
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (dept !== FACET_ALL && r.department !== dept) return false;
      if (priority !== FACET_ALL && r.priority !== priority) return false;
      if (requester !== FACET_ALL && r.createdById !== requester) return false;
      if (!q) return true;
      return (
        r.systemName.toLowerCase().includes(q) ||
        r.number.toLowerCase().includes(q) ||
        (r.createdByName ?? "").toLowerCase().includes(q) ||
        (r.assignedToName ?? "").toLowerCase().includes(q)
      );
    });
  }, [requests, query, dept, priority, requester]);

  const counts = useMemo(() => {
    const c = {} as Record<TabKey, number>;
    for (const t of TABS) c[t.key] = searched.filter((r) => inTab(t, r)).length;
    return c;
  }, [searched]);

  const filtered = useMemo(() => {
    const active = TABS.find((t) => t.key === tab)!;
    return searched.filter((r) => inTab(active, r));
  }, [searched, tab]);

  const open = (number: string) => setSelected(number);
  // The viewer's relationship to a row — drives which inline stage moves show
  // (§12.4). Shared by the desktop table and the mobile cards.
  const stageCtx = (r: RequestListRow) => ({
    role: currentUser.role,
    isRequester: r.createdById === currentUser.id,
    isAssignee: r.assignedToId === currentUser.id,
    assigned: !!r.assignedToId,
  });
  const onKeyOpen = (number: string) => (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(number);
    }
  };

  return (
    <div className="space-y-4">
      {/* Stage tabs + facets grouped on the left (Stage is the tab row; the facets
          narrow within it), search on the right. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <TabScroller>
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3",
                    active ? "bg-accent-soft text-primary" : "text-foreground hover:bg-surface-muted"
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                      active ? "bg-primary/15 text-primary" : "bg-surface-muted text-text-muted"
                    )}
                  >
                    {counts[t.key]}
                  </span>
                </button>
              );
            })}
          </TabScroller>
          {/* Two per row on a phone, not three: at 375px a third column truncates the
              value mid-word ("Requester: …"), which is the one thing a facet must not
              hide. They still sit inline from sm up. */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <FacetSelect
              label="Dept"
              value={dept}
              onValueChange={setDept}
              options={DEPARTMENTS.map((d) => ({
                value: d,
                label: DEPARTMENT_LABELS[d],
              }))}
            />
            <FacetSelect
              label="Priority"
              value={priority}
              onValueChange={setPriority}
              options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))}
            />
            <FacetSelect
              label="Requester"
              value={requester}
              onValueChange={setRequester}
              options={requesterOptions}
            />
            {hasFacets ? (
              <Button
                variant="ghost"
                size="sm"
                className="col-span-3 justify-self-start sm:col-auto"
                onClick={clearFacets}
              >
                <X className="size-4" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>
        <div className="relative lg:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search requests…"
            className="pl-9"
            aria-label="Search requests"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        requests.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="size-5" />}
            title="No requests yet"
            description="Need a new system built? Submit a request and MIS will review it, get it approved, and build it."
            actionHref="/requests/new"
            actionLabel="Request a system"
          />
        ) : (
          <EmptyState
            icon={<Search className="size-5" />}
            title="Nothing here"
            description="No requests match this stage and search."
          />
        )
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((r) => (
              <div
                key={r.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${r.number}: ${r.systemName}`}
                onClick={() => open(r.number)}
                onKeyDown={onKeyOpen(r.number)}
                className="relative cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface py-2.5 pl-4 pr-3 shadow-[var(--shadow-elevation)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:shadow-[var(--shadow-hover)]"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: statusColor(r.status) }}
                />
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-xs font-semibold">{r.number}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.systemName}</span>
                  <span className="shrink-0">
                    <RequestStageControl
                      ticketId={r.id}
                      number={r.number}
                      status={r.status}
                      ctx={stageCtx(r)}
                      onOpenDetail={open}
                    />
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                  <PriorityChip priority={r.priority} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {DEPARTMENT_LABELS[r.department]} · {r.createdByName ?? "—"}
                  </span>
                  <AbsoluteTime date={r.createdAt} dateOnly className="shrink-0 font-mono" />
                </div>
                {r.deadline ? (
                  <div className="mt-1 text-xs text-text-muted">
                    Due{" "}
                    <span className="font-mono tabular-nums text-foreground">
                      {formatDueDate(r.deadline)}
                    </span>
                  </div>
                ) : null}
                {/* §13.5 flag — mobile gets it too, or a finished-but-unlogged build
                    is invisible to anyone working from a phone. */}
                {r.systemCode || ["IN_TESTING", "CLOSED", "CHANGES_REQUESTED"].includes(r.status) ? (
                  <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                    <SystemLoggedCell row={r} />
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)] md:block">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur [&_th]:h-11 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Deadline</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead className="text-right">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={r.id}
                    onClick={() => open(r.number)}
                    className="cursor-pointer transition-colors hover:bg-surface-muted/50 [&>td]:py-2.5 [&>td]:align-top"
                  >
                    <TableCell className="whitespace-nowrap font-mono text-xs text-foreground">
                      {r.number}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[16rem] truncate text-sm font-medium">{r.systemName}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-foreground">
                      {DEPARTMENT_LABELS[r.department]}
                    </TableCell>
                    <TableCell>
                      <RequestStageControl
                        ticketId={r.id}
                        number={r.number}
                        status={r.status}
                        ctx={stageCtx(r)}
                        onOpenDetail={open}
                      />
                    </TableCell>
                    <TableCell><PriorityChip priority={r.priority} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {/* Delivery target committed at start-work (§12.3). Blank until
                          then, like the issue table's Deadline column. */}
                      {formatDueDate(r.deadline) ?? (
                        <span className="text-text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={r.createdByName} image={r.createdByImage} />
                        <span className="max-w-[7rem] truncate text-sm">{r.createdByName ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {r.assignedToId ? (
                        <div className="flex items-center gap-2">
                          <UserAvatar name={r.assignedToName} image={r.assignedToImage} />
                          <span className="max-w-[7rem] truncate text-sm">{r.assignedToName ?? "—"}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <SystemLoggedCell row={r} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {/* §9: lists/tables render absolute IST via the deterministic
                          AbsoluteTime — never relative (that's card-only). */}
                      <AbsoluteTime
                        date={r.createdAt}
                        stacked
                        className="font-mono text-xs leading-tight tabular-nums text-foreground"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <RequestSheet
        number={selected}
        currentUser={currentUser}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}
