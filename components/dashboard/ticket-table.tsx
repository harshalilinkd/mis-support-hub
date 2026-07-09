"use client";

import { useState } from "react";
import { SearchX } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { RelativeTime } from "@/components/relative-time";
import { UserAvatar } from "@/components/user-avatar";
import { TicketSheet } from "@/components/tickets/ticket-sheet";
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
}: {
  tickets: TicketListRow[];
  users: AssignableUser[];
  currentUser: SessionUser;
}) {
  const [selected, setSelected] = useState<string | null>(null);

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
        <div className="max-h-[calc(100vh-19rem)] overflow-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)]">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur [&_th]:h-11 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-text-muted">
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Dept</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="text-right">Age</TableHead>
              <TableHead className="text-right">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow
                key={t.id}
                onClick={() => setSelected(t.number)}
                className="cursor-pointer transition-colors hover:bg-surface-muted/50"
              >
                <TableCell className="font-mono text-xs text-text-muted">
                  {t.number}
                </TableCell>
                <TableCell className="max-w-[20rem] truncate font-medium">
                  {t.title}
                </TableCell>
                <TableCell className="text-sm text-text-muted">
                  {DEPARTMENT_LABELS[t.department]}
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
                  <AssigneeControl
                    ticketId={t.id}
                    assigneeId={t.assignedToId}
                    assigneeName={t.assignedToName}
                    assigneeImage={t.assignedToImage}
                    users={users}
                  />
                </TableCell>
                <TableCell>
                  <StatusControl ticketId={t.id} status={t.status} />
                </TableCell>
                <TableCell>
                  <PriorityControl ticketId={t.id} priority={t.priority} />
                </TableCell>
                <TableCell className="text-right">
                  <RelativeTime
                    date={t.createdAt}
                    className="font-mono text-xs text-text-muted"
                  />
                </TableCell>
                <TableCell className="text-right">
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
