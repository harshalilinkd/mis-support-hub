"use client";

import { ExternalLink } from "lucide-react";

import { AbsoluteTime } from "@/components/absolute-time";
import { UserAvatar } from "@/components/user-avatar";
import type { TicketDetail as TicketDetailData } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { formatDueDate, isUrl, toIso } from "@/lib/format";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { ActivityTimeline } from "./activity-timeline";
import { AttachmentGrid } from "./attachment-grid";
import { AutoClosedBanner } from "./auto-closed-banner";
import { MoveTicketButton } from "./move-ticket-button";
import { PriorityChip, StatusChip } from "./chips";
import { CommentComposer } from "./comment-composer";
import { ResolutionActions } from "./resolution-actions";
import { StaffTicketActions } from "./staff-ticket-actions";
import { TicketActions } from "./ticket-actions";

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function TicketDetail({
  ticket,
  currentUser,
  onMutate,
}: {
  ticket: TicketDetailData;
  currentUser: SessionUser;
  /** Called after a mutation inside the detail (used to reload the Sheet). */
  onMutate?: () => void;
}) {
  const isReporter = ticket.createdById === currentUser.id;
  const isAdmin = currentUser.role === "MIS_ADMIN";
  const isStaff = currentUser.role === "MIS_STAFF" || isAdmin;
  const showResolution =
    ticket.status === "RESOLVED" && (isReporter || isAdmin);
  const canEdit = (isReporter || isAdmin) && ticket.status !== "CLOSED";
  const canDelete = isAdmin || (isReporter && ticket.status === "OPEN");

  const attachments = ticket.attachments.map((a) => ({
    id: a.id,
    url: a.url,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
    commentId: a.commentId,
  }));
  // The ticket's OWN files — what the reporter attached when raising it. Anything
  // posted with a comment belongs to that comment and is rendered there instead, so
  // the two are never mixed in one anonymous grid.
  const ticketAttachments = attachments.filter((a) => !a.commentId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 duration-200 animate-in fade-in slide-in-from-bottom-2">
      {/* Header — a structured hero card: identity + title on top, the metadata in a
          tinted footer strip beneath a hairline. */}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)]">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 sm:p-6">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-text-muted">
                {ticket.number}
              </span>
              <StatusChip status={ticket.status} />
              <PriorityChip priority={ticket.priority} />
            </div>
            <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight">
              {ticket.title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Misfiled? MIS can move it to System Requests (§12). */}
            {isStaff ? (
              <MoveTicketButton
                ticketId={ticket.id}
                number={ticket.number}
                currentType="ISSUE"
                status={ticket.status}
              />
            ) : null}
            {canEdit || canDelete ? (
              <TicketActions
                ticketId={ticket.id}
                number={ticket.number}
                defaults={{
                  title: ticket.title,
                  description: ticket.description,
                  department: ticket.department,
                  sheetLink: ticket.sheetLink ?? "",
                }}
                canEdit={canEdit}
                canDelete={canDelete}
                onMutate={onMutate}
              />
            ) : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border bg-surface-muted/40 px-5 py-4 sm:grid-cols-4 sm:px-6">
          <Meta label="Department" value={DEPARTMENT_LABELS[ticket.department]} />
          <Meta
            label="Reporter"
            value={
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <UserAvatar
                  name={ticket.createdByName}
                  email={ticket.createdByEmail}
                  image={ticket.createdByImage}
                />
                <span className="truncate">{ticket.createdByName ?? "—"}</span>
              </span>
            }
          />
          <Meta
            label="Assignee"
            value={
              ticket.assignedToId ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <UserAvatar
                    name={ticket.assignedToName}
                    email={ticket.assignedToEmail}
                    image={ticket.assignedToImage}
                  />
                  <span className="truncate">{ticket.assignedToName ?? "—"}</span>
                </span>
              ) : (
                <span className="font-normal text-text-muted">Unassigned</span>
              )
            }
          />
          <Meta label="Created" value={<AbsoluteTime date={ticket.createdAt} />} />
          {/* The recorded claim/start days (§5.3) — not necessarily when the buttons
              were pressed. */}
          {ticket.claimedAt ? (
            <Meta label="Claimed" value={formatDueDate(ticket.claimedAt) ?? "—"} />
          ) : null}
          {ticket.startedAt ? (
            <Meta label="Started" value={formatDueDate(ticket.startedAt) ?? "—"} />
          ) : null}
        </dl>
      </div>

      {isStaff ? (
        <StaffTicketActions
          ticketId={ticket.id}
          status={ticket.status}
          assignedToId={ticket.assignedToId}
          assignedToName={ticket.assignedToName}
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
          createdAt={ticket.createdAt}
          onMutate={onMutate}
        />
      ) : null}

      {showResolution ? (
        <ResolutionActions
          ticketId={ticket.id}
          showConfirm={isReporter}
          onDone={onMutate}
        />
      ) : null}

      {/* System auto-closed it (§5) — offer the reporter/admin a reopen. */}
      {ticket.status === "CLOSED" && ticket.autoClosedAt && (isReporter || isAdmin) ? (
        <AutoClosedBanner ticketId={ticket.id} kind="ISSUE" onDone={onMutate} />
      ) : null}

      {/* Description */}
      <Section title="Description">
        <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
          {ticket.description?.trim() ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {ticket.description}
            </p>
          ) : (
            <p className="text-sm italic text-text-muted">
              No description provided.
            </p>
          )}
          {ticket.sheetLink ? (
            <div className="mt-4 border-t border-border pt-4">
              {isUrl(ticket.sheetLink) ? (
                <a
                  href={ticket.sheetLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-input)] border border-border bg-surface-muted/60 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ExternalLink className="size-4" />
                  Open linked sheet
                </a>
              ) : (
                <p className="inline-flex items-center gap-1.5 text-sm text-text-muted">
                  <ExternalLink className="size-4" />
                  System:{" "}
                  <span className="font-medium text-foreground">
                    {ticket.sheetLink}
                  </span>
                </p>
              )}
            </div>
          ) : null}
        </div>
      </Section>

      {/* Attachments */}
      {ticketAttachments.length > 0 ? (
        <Section title="Attachments">
          <AttachmentGrid attachments={ticketAttachments} />
        </Section>
      ) : null}

      {/* Activity + comments */}
      <Section title="Activity">
        <ActivityTimeline
          activity={ticket.activity}
          comments={ticket.comments}
          startedAt={ticket.startedAt ? toIso(ticket.startedAt) : null}
          claimedAt={ticket.claimedAt ? toIso(ticket.claimedAt) : null}
          resolvedAt={ticket.resolvedAt ? toIso(ticket.resolvedAt) : null}
          attachments={attachments}
        />
        <div className="pt-2">
          <CommentComposer ticketId={ticket.id} onDone={onMutate} />
        </div>
      </Section>
    </div>
  );
}
