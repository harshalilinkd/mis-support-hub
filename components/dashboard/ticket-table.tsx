"use client";

import { useState } from "react";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { AbsoluteTime } from "@/components/absolute-time";
import { UserAvatar } from "@/components/user-avatar";
import { ClaimButton } from "@/components/tickets/claim-button";
import { PriorityChip, StatusChip } from "@/components/tickets/chips";
import { TicketLinkFiles } from "@/components/tickets/ticket-link-files";
import { TicketSheet } from "@/components/tickets/ticket-sheet";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TicketListRow } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { formatDueDate } from "@/lib/format";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { PriorityControl, StatusControl } from "./inline-controls";

export function TicketTable({
  tickets,
  currentUser,
  selectedIds,
  selectableIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  tickets: TicketListRow[];
  currentUser: SessionUser;
  selectedIds?: Set<string>;
  selectableIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // A ticket claimed by another member is read-only for me (§6 ownership lock):
  // I can't change its status/priority — only the assignee can.
  const lockedFor = (t: TicketListRow) =>
    !!(t.assignedToId && t.assignedToId !== currentUser.id);

  // Bulk-select column (desktop only): rendered when the parent wires selection
  // in. A row is checkable only when the current user can act on it (claim or
  // delete); the parent decides which rows those are.
  const selectable = !!(selectedIds && selectableIds && onToggleSelect);
  const selectableArr = selectableIds ? [...selectableIds] : [];
  const headerChecked: boolean | "indeterminate" =
    selectable && selectableArr.length > 0
      ? selectableArr.every((id) => selectedIds!.has(id))
        ? true
        : selectableArr.some((id) => selectedIds!.has(id))
          ? "indeterminate"
          : false
      : false;

  return (
    <>
      {tickets.length === 0 ? (
        <EmptyState
          icon={<SearchX className="size-5" />}
          title="No tickets match"
          description="No tickets match your current filters."
          seed={5}
        />
      ) : (
        <>
        {/* Mobile (< md): compact, table-row-style cards. Two tight lines with the
            key fields; tap anywhere opens the full detail (claim / change status &
            priority there) — so there's no wide table to scroll sideways. */}
        <div className="space-y-2 md:hidden">
          {tickets.map((t) => {
            const done = t.status === "RESOLVED" || t.status === "CLOSED";
            const mine = t.assignedToId === currentUser.id;
            const working =
              mine && (t.status === "IN_PROGRESS" || t.status === "REOPENED");
            const canClaim = !done && !working && (!t.assignedToId || mine);
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${t.number}: ${t.title}`}
                onClick={() => setSelected(t.number)}
                onKeyDown={(e) => {
                  // Only when the card itself is focused — not when Enter/Space
                  // bubbles up from the inner Claim button.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(t.number);
                  }
                }}
                className="cursor-pointer rounded-[var(--radius-card)] border border-border bg-surface px-3 py-2.5 shadow-[var(--shadow-elevation)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:shadow-[var(--shadow-hover)]"
              >
                {/* Line 1: number + title + status */}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
                    {t.number}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {t.title}
                  </span>
                  <StatusChip status={t.status} className="shrink-0" />
                </div>

                {/* Line 2: priority · dept · assignee, then a quick claim or the date */}
                <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                  <PriorityChip priority={t.priority} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {DEPARTMENT_LABELS[t.department]}
                    {" · "}
                    {t.assignedToName ?? "Unassigned"}
                  </span>
                  {canClaim ? (
                    <span className="shrink-0">
                      <ClaimButton
                        ticketId={t.id}
                        status={t.status}
                        assigneeId={t.assignedToId}
                        currentUserId={currentUser.id}
                        className="h-7 gap-1 px-2 text-xs"
                      />
                    </span>
                  ) : (
                    <AbsoluteTime
                      date={t.createdAt}
                      dateOnly
                      className="shrink-0 font-mono"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop (md+): full data table. */}
        <div className="hidden max-h-[calc(100vh-19rem)] overflow-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)] md:block">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur [&_th]:h-11 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
            <TableRow>
              {selectable ? (
                <TableHead className="w-9 pl-4">
                  <Checkbox
                    checked={headerChecked}
                    onCheckedChange={() => onToggleSelectAll?.()}
                    disabled={selectableArr.length === 0}
                    aria-label="Select all selectable tickets"
                  />
                </TableHead>
              ) : null}
              <TableHead>Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Dept</TableHead>
              <TableHead>Link / Files</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead className="text-right">Created</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow
                key={t.id}
                onClick={() => setSelected(t.number)}
                className="cursor-pointer transition-colors hover:bg-surface-muted/50 [&>td]:py-2.5 [&>td]:align-top"
              >
                {selectable ? (
                  <TableCell
                    className="w-9 pl-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {selectableIds!.has(t.id) ? (
                      <Checkbox
                        checked={selectedIds!.has(t.id)}
                        onCheckedChange={() => onToggleSelect!(t.id)}
                        aria-label={`Select ${t.number}`}
                      />
                    ) : null}
                  </TableCell>
                ) : null}
                <TableCell className="whitespace-nowrap font-mono text-xs text-foreground">
                  {t.number}
                </TableCell>
                <TableCell>
                  <div className="max-w-[16rem] truncate text-sm font-medium">
                    {t.title}
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
                  <div className="flex items-center gap-2">
                    <UserAvatar name={t.createdByName} image={t.createdByImage} />
                    <span className="max-w-[7rem] truncate text-sm">
                      {t.createdByName ?? "—"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  {t.assignedToId ? (
                    <div className="flex items-center gap-2">
                      <UserAvatar
                        name={t.assignedToName}
                        image={t.assignedToImage}
                      />
                      <span className="max-w-[8rem] truncate text-sm">
                        {t.assignedToName ?? "—"}
                      </span>
                    </div>
                  ) : (
                    <ClaimButton
                      ticketId={t.id}
                      status={t.status}
                      assigneeId={t.assignedToId}
                      currentUserId={currentUser.id}
                    />
                  )}
                </TableCell>
                <TableCell>
                  <StatusControl ticketId={t.id} status={t.status} locked={lockedFor(t)} />
                </TableCell>
                <TableCell>
                  <PriorityControl ticketId={t.id} priority={t.priority} locked={lockedFor(t)} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm tabular-nums">
                  {formatDueDate(t.deadline) ?? (
                    <span className="text-text-muted">—</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <AbsoluteTime
                    date={t.createdAt}
                    stacked
                    className="font-mono text-xs leading-tight tabular-nums text-foreground"
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
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
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
