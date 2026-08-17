"use client";

import { useMemo, useState } from "react";
import { Inbox, MessageSquare, Search } from "lucide-react";

import { AbsoluteTime } from "@/components/absolute-time";
import { EmptyState } from "@/components/shell/empty-state";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SessionUser } from "@/lib/session";
import {
  TICKET_TABS,
  statusesForTab,
  type TicketTabKey,
} from "@/lib/ticket-tabs";
import { formatDueDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { PriorityControl, StatusControl } from "@/components/dashboard/inline-controls";
import { PriorityChip, StatusChip, statusColor } from "./chips";
import type { TicketCardData } from "./ticket-card";
import { TicketLinkFiles } from "./ticket-link-files";
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
    const firstNonEmpty = TICKET_TABS.find((t) =>
      tickets.some((x) => statusesForTab(t.key).includes(x.status))
    );
    return firstNonEmpty?.key ?? "open";
  });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const showAssignee = variant === "raised";
  // MIS staff working their own queue get inline status/priority controls (same
  // as All Tickets); employees viewing tickets they raised see read-only chips.
  const canControl = variant === "assigned";

  // Search-filtered set — shared by the table and the per-tab counts, so the
  // counts reflect the current search (like the admin All Tickets tabs).
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.number.toLowerCase().includes(q)
    );
  }, [tickets, query]);

  const counts = useMemo(() => {
    const c = {} as Record<TicketTabKey, number>;
    for (const t of TICKET_TABS) {
      const set = statusesForTab(t.key);
      c[t.key] = searched.filter((x) => set.includes(x.status)).length;
    }
    return c;
  }, [searched]);

  const filtered = useMemo(() => {
    const set = statusesForTab(tab);
    return searched.filter((t) => set.includes(t.status));
  }, [searched, tab]);

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
      {/* Toolbar: status tabs (with counts) + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex w-full overflow-x-auto rounded-[var(--radius-input)] border border-border bg-surface p-0.5 [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden">
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
        </div>
        <div className="relative sm:w-64">
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
                    className="cursor-pointer transition-colors hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>td]:py-2.5 [&>td]:align-top"
                  >
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
