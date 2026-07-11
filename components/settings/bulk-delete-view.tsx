"use client";

import { useMemo, useState } from "react";
import { Inbox, Search, Trash2 } from "lucide-react";

import type { Department, Priority, Status } from "@/lib/db/schema";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { AbsoluteTime } from "@/components/absolute-time";
import { PriorityChip, StatusChip } from "@/components/tickets/chips";
import { BulkDeleteDialog } from "@/components/tickets/bulk-delete-dialog";
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

export type BulkDeleteTicket = {
  id: string;
  number: string;
  title: string;
  department: Department;
  status: Status;
  priority: Priority | null;
  createdByName: string | null;
  createdAt: string; // ISO
};

/**
 * Settings → Bulk Delete: pick multiple active tickets and move them to the
 * recycle bin in one go (admin-only; restorable). Selection persists across the
 * search box so you can gather tickets from different searches before deleting.
 */
export function BulkDeleteView({ tickets }: { tickets: BulkDeleteTicket[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.number.toLowerCase().includes(q)
    );
  }, [tickets, query]);

  // Select-all reflects the currently-searched rows.
  const allChecked: boolean | "indeterminate" =
    searched.length > 0 && searched.every((t) => selectedIds.has(t.id))
      ? true
      : searched.some((t) => selectedIds.has(t.id))
        ? "indeterminate"
        : false;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const all =
      searched.length > 0 && searched.every((t) => selectedIds.has(t.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const t of searched) {
        if (all) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="size-5" />}
        title="No tickets to delete"
        description="There are no active tickets. Anything you delete lives in the Recycle Bin."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tickets…"
          className="pl-9"
          aria-label="Search tickets"
        />
      </div>

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-input)] border border-destructive/30 bg-destructive/5 px-3 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-4" /> Delete {selectedIds.size}
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

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)]">
        <Table>
          <TableHeader className="[&_th]:h-11 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
            <TableRow>
              <TableHead className="w-9 pl-4">
                <Checkbox
                  checked={allChecked}
                  onCheckedChange={toggleAll}
                  disabled={searched.length === 0}
                  aria-label="Select all tickets"
                />
              </TableHead>
              <TableHead>Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Dept</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead className="pr-4 text-right">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {searched.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className="py-10 text-center text-sm text-text-muted"
                >
                  No tickets match your search.
                </TableCell>
              </TableRow>
            ) : null}
            {searched.map((t) => (
              <TableRow
                key={t.id}
                data-state={selectedIds.has(t.id) ? "selected" : undefined}
                className="[&>td]:py-2.5 [&>td]:align-top"
              >
                <TableCell className="w-9 pl-4">
                  <Checkbox
                    checked={selectedIds.has(t.id)}
                    onCheckedChange={() => toggle(t.id)}
                    aria-label={`Select ${t.number}`}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-foreground">
                  {t.number}
                </TableCell>
                <TableCell>
                  <div className="max-w-[18rem] truncate text-sm font-medium">
                    {t.title}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-foreground">
                  {DEPARTMENT_LABELS[t.department]}
                </TableCell>
                <TableCell>
                  <StatusChip status={t.status} />
                </TableCell>
                <TableCell>
                  <PriorityChip priority={t.priority} />
                </TableCell>
                <TableCell className="max-w-[9rem] truncate text-sm text-foreground">
                  {t.createdByName ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap pr-4 text-right">
                  <AbsoluteTime
                    date={t.createdAt}
                    stacked
                    className="font-mono text-xs leading-tight tabular-nums text-foreground"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <BulkDeleteDialog
        ticketIds={[...selectedIds]}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDone={() => {
          setDeleteOpen(false);
          setSelectedIds(new Set());
        }}
      />
    </div>
  );
}
