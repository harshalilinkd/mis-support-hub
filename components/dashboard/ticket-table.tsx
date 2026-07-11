"use client";

import { useState } from "react";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { AbsoluteTime } from "@/components/absolute-time";
import { UserAvatar } from "@/components/user-avatar";
import { ClaimButton } from "@/components/tickets/claim-button";
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
import type { AssignableUser, TicketListRow } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { formatDueDate } from "@/lib/format";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import {
  AssigneeControl,
  PriorityControl,
  StatusControl,
} from "./inline-controls";

export function TicketTable({
  tickets,
  users,
  currentUser,
  selectedIds,
  claimableIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  tickets: TicketListRow[];
  users: AssignableUser[];
  currentUser: SessionUser;
  selectedIds?: Set<string>;
  claimableIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // Bulk-select column (desktop only): rendered when the parent wires selection
  // in. A row is checkable only if the current user can actually claim it.
  const selectable = !!(selectedIds && claimableIds && onToggleSelect);
  const claimableArr = claimableIds ? [...claimableIds] : [];
  const headerChecked: boolean | "indeterminate" =
    selectable && claimableArr.length > 0
      ? claimableArr.every((id) => selectedIds!.has(id))
        ? true
        : claimableArr.some((id) => selectedIds!.has(id))
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
        {/* Mobile (< md): tap-to-open cards; triage controls stay inline. */}
        <div className="space-y-3 md:hidden">
          {tickets.map((t) => (
            <div
              key={t.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(t.number)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(t.number);
                }
              }}
              className="cursor-pointer rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-elevation)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:shadow-[var(--shadow-hover)]"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-text-muted">
                  {t.number}
                </span>
                <PriorityControl ticketId={t.id} priority={t.priority} />
              </div>
              <p className="mt-1 font-medium">{t.title}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <StatusControl ticketId={t.id} status={t.status} />
                <span className="text-xs text-text-muted">
                  {DEPARTMENT_LABELS[t.department]}
                </span>
                {formatDueDate(t.deadline) ? (
                  <span className="text-xs text-text-muted">
                    Due {formatDueDate(t.deadline)}
                  </span>
                ) : null}
                <AbsoluteTime
                  date={t.createdAt}
                  className="ml-auto font-mono text-xs text-text-muted"
                />
              </div>
              <div className="mt-2">
                <TicketLinkFiles
                  sheetLink={t.sheetLink}
                  attachments={t.attachments}
                />
              </div>
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                <ClaimButton
                  ticketId={t.id}
                  status={t.status}
                  assigneeId={t.assignedToId}
                  currentUserId={currentUser.id}
                  isAdmin={currentUser.role === "MIS_ADMIN"}
                />
                <AssigneeControl
                  ticketId={t.id}
                  assigneeId={t.assignedToId}
                  assigneeName={t.assignedToName}
                  assigneeImage={t.assignedToImage}
                  users={users}
                />
              </div>
            </div>
          ))}
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
                    disabled={claimableArr.length === 0}
                    aria-label="Select all claimable tickets"
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
                    {claimableIds!.has(t.id) ? (
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
                  <div className="flex items-center gap-2">
                    <ClaimButton
                      ticketId={t.id}
                      status={t.status}
                      assigneeId={t.assignedToId}
                      currentUserId={currentUser.id}
                      isAdmin={currentUser.role === "MIS_ADMIN"}
                    />
                    <AssigneeControl
                      ticketId={t.id}
                      assigneeId={t.assignedToId}
                      assigneeName={t.assignedToName}
                      assigneeImage={t.assignedToImage}
                      users={users}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <StatusControl ticketId={t.id} status={t.status} />
                </TableCell>
                <TableCell>
                  <PriorityControl ticketId={t.id} priority={t.priority} />
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
