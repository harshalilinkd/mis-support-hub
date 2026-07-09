"use client";

import { useMemo, useState } from "react";
import { Inbox, MessageSquare, Search } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { RelativeTime } from "@/components/relative-time";
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
import { ACTIVE_STATUSES } from "@/lib/ticket-state";
import { cn } from "@/lib/utils";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { PriorityChip, StatusChip } from "./chips";
import type { TicketCardData } from "./ticket-card";
import { TicketSheet } from "./ticket-sheet";

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "resolved", label: "Resolved" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

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
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const showAssignee = variant === "raised";

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      const matchTab =
        tab === "all"
          ? true
          : tab === "active"
            ? ACTIVE_STATUSES.includes(t.status)
            : t.status === "RESOLVED" || t.status === "CLOSED";
      const matchQuery =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.number.toLowerCase().includes(q);
      return matchTab && matchQuery;
    });
  }, [tickets, tab, query]);

  const open = (number: string) => setSelected(number);
  const onKeyOpen = (number: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(number);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar: tabs + search */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-[var(--radius-input)] border border-border bg-surface p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-[6px] px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.key
                  ? "bg-accent-soft text-primary"
                  : "text-text-muted hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
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
            title="No matching tickets"
            description="Try a different search term or filter."
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
                  <RelativeTime date={t.updatedAt} />
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
                    <TableCell className="pl-4">
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
                    <TableCell className="max-w-[22rem]">
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
                    <TableCell className="whitespace-nowrap text-sm text-text-muted">
                      {DEPARTMENT_LABELS[t.department]}
                    </TableCell>
                    <TableCell>
                      <StatusChip status={t.status} />
                    </TableCell>
                    <TableCell>
                      <PriorityChip priority={t.priority} />
                    </TableCell>
                    {showAssignee ? (
                      <TableCell className="max-w-[9rem] truncate text-sm text-text-muted">
                        {t.assignedToName ?? "Unassigned"}
                      </TableCell>
                    ) : null}
                    <TableCell className="pr-4 text-right">
                      <RelativeTime
                        date={t.updatedAt}
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
