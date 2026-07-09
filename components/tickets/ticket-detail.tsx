import { ExternalLink } from "lucide-react";

import { RelativeTime } from "@/components/relative-time";
import type { TicketDetail as TicketDetailData } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { STAFF_ROLES } from "@/lib/authz";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { ActivityTimeline } from "./activity-timeline";
import { AttachmentGrid } from "./attachment-grid";
import { PriorityChip, StatusChip } from "./chips";
import { CommentComposer } from "./comment-composer";
import { ResolutionActions } from "./resolution-actions";

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

export function TicketDetail({
  ticket,
  currentUser,
}: {
  ticket: TicketDetailData;
  currentUser: SessionUser;
}) {
  const isReporter = ticket.createdById === currentUser.id;
  const isAdmin = currentUser.role === "MIS_ADMIN";
  const isStaff = STAFF_ROLES.includes(currentUser.role);
  const showResolution =
    ticket.status === "RESOLVED" && (isReporter || isAdmin);

  const attachments = ticket.attachments.map((a) => ({
    id: a.id,
    url: a.url,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6 duration-200 animate-in fade-in slide-in-from-bottom-2">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-text-muted">
            {ticket.number}
          </span>
          <StatusChip status={ticket.status} />
          <PriorityChip priority={ticket.priority} />
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {ticket.title}
        </h1>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Meta label="Department" value={DEPARTMENT_LABELS[ticket.department]} />
          <Meta label="Reporter" value={ticket.createdByName ?? "—"} />
          <Meta
            label="Assignee"
            value={ticket.assignedToName ?? "Unassigned"}
          />
          <Meta label="Created" value={<RelativeTime date={ticket.createdAt} />} />
        </dl>
      </div>

      {showResolution ? (
        <ResolutionActions ticketId={ticket.id} showConfirm={isReporter} />
      ) : null}

      {/* Description */}
      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {ticket.description}
        </p>
        {ticket.sheetLink ? (
          <a
            href={ticket.sheetLink}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-4" />
            Open linked sheet
          </a>
        ) : null}
      </section>

      {/* Attachments */}
      <section className="space-y-3">
        <h2 className="font-display text-sm font-semibold">Attachments</h2>
        <AttachmentGrid attachments={attachments} />
      </section>

      {/* Activity + comments */}
      <section className="space-y-4">
        <h2 className="font-display text-sm font-semibold">Activity</h2>
        <ActivityTimeline
          activity={ticket.activity}
          comments={ticket.comments}
        />
        <div className="pt-2">
          <CommentComposer ticketId={ticket.id} />
        </div>
      </section>

      {isStaff ? (
        <p className="text-center text-xs text-text-muted">
          MIS status, assignment, and priority controls arrive with the dashboard
          and board.
        </p>
      ) : null}
    </div>
  );
}
