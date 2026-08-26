"use client";

import { useEffect, useMemo, useState } from "react";
import { Inbox, MessageSquare, Play, Search, X } from "lucide-react";

import { AbsoluteTime } from "@/components/absolute-time";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { SessionUser } from "@/lib/session";
import {
  TICKET_TABS,
  matchesTicketTab,
  type TicketTabKey,
} from "@/lib/ticket-tabs";
import { formatDueDate, humanizeEnum } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TabScroller } from "@/components/shell/tab-scroller";
import {
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  PRIORITIES,
} from "@/lib/validators/ticket";
import { PriorityControl, StatusControl } from "@/components/dashboard/inline-controls";
import { PriorityChip, StatusChip, statusColor } from "./chips";
import type { TicketCardData } from "./ticket-card";
import { TicketLinkFiles } from "./ticket-link-files";
import { BulkStartDialog } from "./bulk-start-dialog";
import { TicketSheet } from "./ticket-sheet";

export function MyTicketsView({
  tickets,
  variant = "raised",
  currentUser,
  initialTab,
}: {
  tickets: TicketCardData[];
  variant?: "raised" | "assigned";
  currentUser: SessionUser;
  /** Deep-link: pre-select a status tab (e.g. from a dashboard KPI). */
  initialTab?: TicketTabKey;
}) {
  // A deep-linked tab wins; otherwise land on the first tab that actually has tickets
  // (Open → In Progress → Resolved) so the employee sees their tickets, not an empty tab.
  const [tab, setTab] = useState<TicketTabKey>(() => {
    if (initialTab) return initialTab;
    // Skip "all" here so the auto-landing still picks the first non-empty status
    // tab (Open → …) rather than always defaulting to All.
    const firstNonEmpty = TICKET_TABS.find(
      (t) => t.key !== "all" && tickets.some((x) => matchesTicketTab(t.key, x))
    );
    return firstNonEmpty?.key ?? "open";
  });
  const [query, setQuery] = useState("");
  const [dept, setDept] = useState(FACET_ALL);
  const [priority, setPriority] = useState(FACET_ALL);
  const [reporter, setReporter] = useState(FACET_ALL);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [startOpen, setStartOpen] = useState(false);

  const showAssignee = variant === "raised";
  // MIS staff working their own queue get inline status/priority controls (same
  // as All Tickets); employees viewing tickets they raised see read-only chips.
  const canControl = variant === "assigned";
  // Reporter only varies on the ASSIGNED queue — on the raised view every ticket
  // is the viewer's own, so the facet would be a single, pointless option.
  const showReporterFacet = variant === "assigned";

  // Reporter options: the distinct people who raised the tickets in this list.
  const reporterOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const t of tickets) {
      if (t.createdById) byId.set(t.createdById, t.createdByName ?? "—");
    }
    return [...byId]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [tickets]);

  const hasFacets =
    dept !== FACET_ALL ||
    priority !== FACET_ALL ||
    (showReporterFacet && reporter !== FACET_ALL);

  const clearFacets = () => {
    setDept(FACET_ALL);
    setPriority(FACET_ALL);
    setReporter(FACET_ALL);
    setQuery("");
  };

  // Facets (dept / priority / reporter) + search — shared by the table and the
  // per-tab counts, so the counts reflect the active facets (like All Tickets).
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (dept !== FACET_ALL && t.department !== dept) return false;
      if (priority !== FACET_ALL && t.priority !== priority) return false;
      if (showReporterFacet && reporter !== FACET_ALL && t.createdById !== reporter)
        return false;
      if (!q) return true;
      return (
        t.title.toLowerCase().includes(q) || t.number.toLowerCase().includes(q)
      );
    });
  }, [tickets, query, dept, priority, reporter, showReporterFacet]);

  const counts = useMemo(() => {
    const c = {} as Record<TicketTabKey, number>;
    for (const t of TICKET_TABS) {
      c[t.key] = searched.filter((x) => matchesTicketTab(t.key, x)).length;
    }
    return c;
  }, [searched]);

  const filtered = useMemo(
    () => searched.filter((t) => matchesTicketTab(tab, t)),
    [searched, tab]
  );

  // Rows this queue can bulk-START: unstarted claims (§5 — startTask moves
  // OPEN/REOPENED → IN_PROGRESS). Only on the ASSIGNED variant, where every row is
  // already the viewer's own claim; the "raised" variant is an employee's read-only
  // list and gets no checkboxes at all.
  const startableIds = useMemo(() => {
    if (!canControl) return new Set<string>();
    return new Set(
      filtered
        .filter((t) => t.status === "OPEN" || t.status === "REOPENED")
        .map((t) => t.id)
    );
  }, [filtered, canControl]);

  const selectedTickets = useMemo(
    () => filtered.filter((t) => selectedIds.has(t.id)),
    [filtered, selectedIds]
  );

  // Drop any id that stops being startable when a tab/facet/refresh changes the rows,
  // so the "N selected" count can never lie or dead-end (same rule as All Issues).
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => startableIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [startableIds]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allSelected =
      startableIds.size > 0 &&
      [...startableIds].every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(startableIds));
  }

  const open = (number: string) => setSelected(number);
  const onKeyOpen = (number: string) => (e: React.KeyboardEvent) => {
    // Only when the row/card itself is focused — not when the keystroke bubbles
    // up from an inner control (the status/priority dropdown) or a link.
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(number);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: status tabs + facets grouped together on the left (Status is the
          tab row; the facets narrow within it), search on the right. Reporter only
          appears on the assigned queue (own-raised tickets are all yours). */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <TabScroller>
            {TICKET_TABS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2.5 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3",
                    active
                      ? "bg-accent-soft text-primary"
                      : "text-foreground hover:bg-surface-muted"
                  )}
                >
                  {t.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                      active
                        ? "bg-primary/15 text-primary"
                        : "bg-surface-muted text-text-muted"
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
            {showReporterFacet ? (
              <FacetSelect
                label="Reporter"
                value={reporter}
                onValueChange={setReporter}
                options={reporterOptions}
              />
            ) : null}
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
            placeholder="Search my tickets…"
            className="pl-9"
            aria-label="Search my tickets"
          />
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-input)] border border-primary/30 bg-accent-soft px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" onClick={() => setStartOpen(true)}>
            <Play className="size-4" /> Start selected
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        tickets.length === 0 ? (
          variant === "assigned" ? (
            <EmptyState
              icon={<Inbox className="size-5" />}
              title="Nothing assigned to you"
              description="Claim a ticket from the dashboard and it will show up here as your active work."
              actionHref="/dashboard"
              actionLabel="Go to dashboard"
            />
          ) : (
            <EmptyState
              icon={<Inbox className="size-5" />}
              title="No tickets yet"
              description="Raise a ticket for any system, sheet, or app issue and the MIS team will pick it up."
              actionHref="/new"
              actionLabel="Raise a ticket"
            />
          )
        ) : (
          <EmptyState
            icon={<Search className="size-5" />}
            title="No tickets here"
            description="Nothing matches this tab and search — try another tab."
          />
        )
      ) : (
        <>
          {/* Mobile (< md): compact, table-row-style cards. The title gets its own
              line so the status/priority controls don't squeeze it; the coloured
              left bar shows status at a glance. Tap opens the full detail. */}
          <div className="space-y-2 md:hidden">
            {filtered.map((t) => {
              const due = formatDueDate(t.deadline);
              return (
                <div
                  key={t.number}
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${t.number}: ${t.title}`}
                  onClick={() => open(t.number)}
                  onKeyDown={onKeyOpen(t.number)}
                  className="relative cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface py-2.5 pl-4 pr-3 shadow-[var(--shadow-elevation)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:shadow-[var(--shadow-hover)]"
                >
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-1"
                    style={{ backgroundColor: statusColor(t.status) }}
                  />
                  {/* Line 1: number + title + status */}
                  <div className="flex items-center gap-2">
                    <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
                      {t.number}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {t.title}
                    </span>
                    <span className="shrink-0">
                      {canControl ? (
                        <StatusControl
                          ticketId={t.id}
                          status={t.status}
                          role={currentUser.role}
                          createdAt={t.createdAt}
                          mine
                        />
                      ) : (
                        <StatusChip status={t.status} />
                      )}
                    </span>
                  </div>
                  {/* Line 2: priority + dept · due · assignee, then comments + date */}
                  <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                    <span className="shrink-0">
                      {canControl ? (
                        <PriorityControl ticketId={t.id} priority={t.priority} />
                      ) : (
                        <PriorityChip priority={t.priority} />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {DEPARTMENT_LABELS[t.department]}
                      {due ? ` · Due ${due}` : ""}
                      {showAssignee && t.assignedToName
                        ? ` · ${t.assignedToName}`
                        : ""}
                    </span>
                    {t.commentCount > 0 ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5">
                        <MessageSquare className="size-3" />
                        {t.commentCount}
                      </span>
                    ) : null}
                    <AbsoluteTime
                      date={t.updatedAt}
                      dateOnly
                      className="shrink-0 font-mono"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop (md+): compact data table. */}
          <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)] md:block">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur [&_th]:h-11 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
                <TableRow className="hover:bg-transparent">
                  {/* Multi-select for bulk Start — assigned queue only, and only for
                      rows that can actually be started (§5). */}
                  {canControl ? (
                    <TableHead className="w-9 pl-4">
                      <Checkbox
                        checked={
                          startableIds.size > 0 &&
                          [...startableIds].every((id) => selectedIds.has(id))
                        }
                        onCheckedChange={toggleSelectAll}
                        disabled={startableIds.size === 0}
                        aria-label="Select all startable tickets"
                      />
                    </TableHead>
                  ) : null}
                  <TableHead className="pl-4">Ticket</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>Link / Files</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Deadline</TableHead>
                  {showAssignee ? <TableHead>Assignee</TableHead> : null}
                  <TableHead className="pr-4 text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow
                    key={t.number}
                    onClick={() => open(t.number)}
                    tabIndex={0}
                    onKeyDown={onKeyOpen(t.number)}
                    data-state={selectedIds.has(t.id) ? "selected" : undefined}
                    className="cursor-pointer transition-colors hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>td]:py-2.5 [&>td]:align-top"
                  >
                    {canControl ? (
                      <TableCell
                        className="w-9 pl-4"
                        // The row opens the ticket; the checkbox must not.
                        onClick={(e) => e.stopPropagation()}
                      >
                        {startableIds.has(t.id) ? (
                          <Checkbox
                            checked={selectedIds.has(t.id)}
                            onCheckedChange={() => toggleSelect(t.id)}
                            aria-label={`Select ${t.number}`}
                          />
                        ) : null}
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-nowrap pl-4">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: statusColor(t.status) }}
                        />
                        <span className="font-mono text-xs text-foreground">
                          {t.number}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 max-w-[20rem] items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {t.title}
                        </span>
                        {t.commentCount > 0 ? (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-text-muted">
                            <MessageSquare className="size-3" />
                            {t.commentCount}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-foreground">
                      {DEPARTMENT_LABELS[t.department]}
                    </TableCell>
                    <TableCell>
                      <TicketLinkFiles
                        sheetLink={t.sheetLink}
                        attachments={t.attachments}
                      />
                    </TableCell>
                    <TableCell>
                      {canControl ? (
                        <StatusControl
                          ticketId={t.id}
                          status={t.status}
                          role={currentUser.role}
                          createdAt={t.createdAt}
                          mine
                        />
                      ) : (
                        <StatusChip status={t.status} />
                      )}
                    </TableCell>
                    <TableCell>
                      {canControl ? (
                        <PriorityControl ticketId={t.id} priority={t.priority} />
                      ) : (
                        <PriorityChip priority={t.priority} />
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">
                      {formatDueDate(t.deadline) ?? (
                        <span className="text-text-muted">—</span>
                      )}
                    </TableCell>
                    {showAssignee ? (
                      <TableCell className="max-w-[9rem] text-sm text-foreground">
                        <span className="block truncate">
                          {t.assignedToName ?? "Unassigned"}
                        </span>
                      </TableCell>
                    ) : null}
                    <TableCell className="whitespace-nowrap pr-4 text-right">
                      <AbsoluteTime
                        date={t.updatedAt}
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

      <BulkStartDialog
        tickets={selectedTickets}
        open={startOpen}
        onOpenChange={setStartOpen}
        onDone={() => {
          setStartOpen(false);
          setSelectedIds(new Set());
        }}
      />

      <TicketSheet
        number={selected}
        currentUser={currentUser}
        onOpenChange={(o) => {
          if (!o) setSelected(null);
        }}
      />
    </div>
  );
}
