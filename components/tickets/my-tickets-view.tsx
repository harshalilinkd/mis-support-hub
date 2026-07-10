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
import type { Status } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/session";
import {
  TICKET_TABS,
  statusesForTab,
  type TicketTabKey,
} from "@/lib/ticket-tabs";
import { cn } from "@/lib/utils";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { PriorityChip, StatusChip } from "./chips";
import type { TicketCardData } from "./ticket-card";
import { TicketLinkFiles } from "./ticket-link-files";
import { TicketSheet } from "./ticket-sheet";

/** Left status accent, mirrors the ticket color language used across the app. */
const STATUS_BAR: Record<Status, string> = {
  OPEN: "var(--status-open)",
  IN_PROGRESS: "var(--status-in-progress)",
  REOPENED: "var(--status-reopened)",
  RESOLVED: "var(--status-resolved)",
  CLOSED: "var(--status-closed)",
};

export function MyTicketsView({
  tickets,
  variant = "raised",
  currentUser,
}: {
  tickets: TicketCardData[];
  variant?: "raised" | "assigned";
  currentUser: SessionUser;
}) {
  // Land on the first tab that actually has tickets (Open → In Progress →
  // Resolved), so the employee sees their tickets instead of an empty default.
  const [tab, setTab] = useState<TicketTabKey>(() => {
    const firstNonEmpty = TICKET_TABS.find((t) =>
      tickets.some((x) => statusesForTab(t.key).includes(x.status))
    );
    return firstNonEmpty?.key ?? "open";
  });
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const showAssignee = variant === "raised";

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
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(number);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: status tabs (with counts) + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-[var(--radius-input)] border border-border bg-surface p-0.5">
          {TICKET_TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-accent-soft text-primary"
                    : "text-text-muted hover:text-foreground"
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
          {/* Mobile (< md): compact tap-to-open cards. */}
          <div className="space-y-3 md:hidden">
            {filtered.map((t) => (
              <div
                key={t.number}
                role="button"
                tabIndex={0}
                onClick={() => open(t.number)}
                onKeyDown={onKeyOpen(t.number)}
                className="relative cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface py-4 pl-5 pr-4 shadow-[var(--shadow-elevation)] transition-shadow hover:shadow-[var(--shadow-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: STATUS_BAR[t.status] }}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-text-muted">
                        {t.number}
                      </span>
                      <StatusChip status={t.status} />
                    </div>
                    <h3 className="mt-1 truncate font-medium">{t.title}</h3>
                  </div>
                  <PriorityChip priority={t.priority} className="shrink-0" />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                  <span>{DEPARTMENT_LABELS[t.department]}</span>
                  <span aria-hidden>·</span>
                  <AbsoluteTime date={t.updatedAt} />
                  {t.commentCount > 0 ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="size-3" />
                        {t.commentCount}
                      </span>
                    </>
                  ) : null}
                  {showAssignee && t.assignedToName ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{t.assignedToName}</span>
                    </>
                  ) : null}
                </div>
                <div className="mt-2">
                  <TicketLinkFiles
                    sheetLink={t.sheetLink}
                    attachments={t.attachments}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Desktop (md+): compact data table. */}
          <div className="hidden max-h-[calc(100vh-17rem)] overflow-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)] md:block">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur [&_th]:h-11 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-text-muted">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4">Ticket</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>Link / Files</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
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
                    className="cursor-pointer transition-colors hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <TableCell className="pl-4 align-top">
                      <div className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ backgroundColor: STATUS_BAR[t.status] }}
                        />
                        <span className="font-mono text-xs text-text-muted">
                          {t.number}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[22rem] align-top">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{t.title}</span>
                        {t.commentCount > 0 ? (
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-xs text-text-muted">
                            <MessageSquare className="size-3" />
                            {t.commentCount}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-top text-sm text-text-muted">
                      {DEPARTMENT_LABELS[t.department]}
                    </TableCell>
                    <TableCell className="align-top">
                      <TicketLinkFiles
                        sheetLink={t.sheetLink}
                        attachments={t.attachments}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <StatusChip status={t.status} />
                    </TableCell>
                    <TableCell className="align-top">
                      <PriorityChip priority={t.priority} />
                    </TableCell>
                    {showAssignee ? (
                      <TableCell className="max-w-[9rem] truncate align-top text-sm text-text-muted">
                        {t.assignedToName ?? "Unassigned"}
                      </TableCell>
                    ) : null}
                    <TableCell className="pr-4 text-right align-top">
                      <AbsoluteTime
                        date={t.updatedAt}
                        stacked
                        className="font-mono text-xs text-text-muted"
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
