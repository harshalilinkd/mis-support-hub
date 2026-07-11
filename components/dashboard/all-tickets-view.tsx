"use client";

import { useEffect, useMemo, useState } from "react";
import { Hand } from "lucide-react";

import type { AssignableUser, TicketListRow } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import {
  TICKET_TABS,
  statusesForTab,
  type TicketTabKey,
} from "@/lib/ticket-tabs";
import { cn } from "@/lib/utils";
import { BulkClaimDialog } from "@/components/tickets/bulk-claim-dialog";
import { Button } from "@/components/ui/button";
import { TableToolbar } from "./table-toolbar";
import { TicketTable } from "./ticket-table";

/**
 * All Tickets with instant, client-side status tabs. The server sends every
 * ticket matching the facet filters (department / priority / assignee / search
 * from the URL); switching Open / In Progress / Resolved / Closed just re-filters
 * in memory — no navigation or refetch. Facets stay server-driven (the toolbar
 * reflects them into the URL). MIS can bulk-select claimable tickets and claim
 * them together via the selection bar. (Bulk delete lives in Settings.)
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

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

  // Rows the user can CLAIM (same rule as the per-row Claim button): not
  // resolved/closed, and unassigned or already mine — never someone else's, not
  // even for an admin (§6 ownership lock). Only these get a checkbox here.
  const claimableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of filtered) {
      const done = t.status === "RESOLVED" || t.status === "CLOSED";
      const mine = t.assignedToId === currentUser.id;
      const working =
        mine && (t.status === "IN_PROGRESS" || t.status === "REOPENED");
      if (!done && !working && (!t.assignedToId || mine)) ids.add(t.id);
    }
    return ids;
  }, [filtered, currentUser.id]);

  const selectedTickets = useMemo(
    () => filtered.filter((t) => selectedIds.has(t.id)),
    [filtered, selectedIds]
  );

  // Keep the selection in sync with what's actually claimable — drop any id no
  // longer claimable when a facet/search/tab/auto-refresh changes the rows, so
  // the "N selected" count never lies or dead-ends.
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => claimableIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [claimableIds]);

  // Selection is scoped to the visible set — switching tabs clears it.
  function switchTab(key: TicketTabKey) {
    setTab(key);
    setSelectedIds(new Set());
  }

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
      claimableIds.size > 0 &&
      [...claimableIds].every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(claimableIds));
  }

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
                onClick={() => switchTab(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
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
        <div className="min-w-[240px] flex-1">
          <TableToolbar users={users} />
        </div>
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-input)] border border-primary/30 bg-accent-soft px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            <Hand className="size-4" /> Claim selected
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

      <TicketTable
        tickets={filtered}
        currentUser={currentUser}
        selectedIds={selectedIds}
        selectableIds={claimableIds}
        onToggleSelect={toggleSelect}
        onToggleSelectAll={toggleSelectAll}
      />

      <BulkClaimDialog
        tickets={selectedTickets}
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onDone={() => {
          setBulkOpen(false);
          setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
