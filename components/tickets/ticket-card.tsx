import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { RelativeTime } from "@/components/relative-time";
import type { Department, Priority, Status } from "@/lib/db/schema";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { PriorityChip, StatusChip } from "./chips";

export type TicketCardData = {
  number: string;
  title: string;
  department: Department;
  status: Status;
  priority: Priority;
  updatedAt: string | Date;
  assignedToName: string | null;
  commentCount: number;
};

export function TicketCard({
  ticket,
  style,
}: {
  ticket: TicketCardData;
  style?: React.CSSProperties;
}) {
  return (
    <Link
      href={`/tickets/${ticket.number}`}
      style={style}
      className="block animate-in rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-elevation)] fade-in slide-in-from-bottom-1 duration-200 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-text-muted">
              {ticket.number}
            </span>
            <StatusChip status={ticket.status} />
          </div>
          <h3 className="mt-1 truncate font-medium">{ticket.title}</h3>
        </div>
        <PriorityChip priority={ticket.priority} className="shrink-0" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        <span>{DEPARTMENT_LABELS[ticket.department]}</span>
        <span aria-hidden>·</span>
        <RelativeTime date={ticket.updatedAt} />
        {ticket.commentCount > 0 ? (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="size-3" />
              {ticket.commentCount}
            </span>
          </>
        ) : null}
        {ticket.assignedToName ? (
          <>
            <span aria-hidden>·</span>
            <span className="truncate">{ticket.assignedToName}</span>
          </>
        ) : null}
      </div>
    </Link>
  );
}
