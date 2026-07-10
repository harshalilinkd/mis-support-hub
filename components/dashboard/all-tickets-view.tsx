"use client";

import { useMemo, useState } from "react";

import type { AssignableUser, TicketListRow } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import {
  TICKET_TABS,
  statusesForTab,
  type TicketTabKey,
} from "@/lib/ticket-tabs";
import { cn } from "@/lib/utils";
import { TableToolbar } from "./table-toolbar";
import { TicketTable } from "./ticket-table";

/**
 * All Tickets with instant, client-side status tabs. The server sends every
 * ticket matching the facet filters (department / priority / assignee / search
 * from the URL); switching Open / In Progress / Resolved just re-filters in
 * memory — no navigation or refetch — so it's immediate even on rapid clicks.
 * Facets stay server-driven (the toolbar reflects them into the URL).
 */
export function AllTicketsView({
  tickets,
  users,
  currentUser,
  initialTab,
}: {
  tickets: TicketListRow[];
  users: AssignableUser[];
  currentUser: SessionUser;
  initialTab: TicketTabKey;
}) {
  const [tab, setTab] = useState<TicketTabKey>(initialTab);

  const counts = useMemo(() => {
    const c = {} as Record<TicketTabKey, number>;
    for (const t of TICKET_TABS) {
      const set = statusesForTab(t.key);
      c[t.key] = tickets.filter((x) => set.includes(x.status)).length;
    }
    return c;
  }, [tickets]);

  const filtered = useMemo(() => {
    const set = statusesForTab(tab);
    return tickets.filter((t) => set.includes(t.status));
  }, [tickets, tab]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div
          aria-label="Filter tickets by status"
          className="inline-flex rounded-[var(--radius-input)] border border-border bg-surface p-0.5"
        >
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
        <div className="min-w-[240px] flex-1">
          <TableToolbar users={users} />
        </div>
      </div>
      <TicketTable tickets={filtered} users={users} currentUser={currentUser} />
    </div>
  );
}
