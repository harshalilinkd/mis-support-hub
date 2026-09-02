"use client";

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { loadDeletedTicketDetail } from "@/lib/actions/tickets";
import type { DeletedTicketDetail } from "@/lib/db/queries";
import { formatDueDate, isUrl, toIso } from "@/lib/format";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { AbsoluteTime } from "@/components/absolute-time";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ActivityTimeline } from "@/components/tickets/activity-timeline";
import { AttachmentGrid } from "@/components/tickets/attachment-grid";
import { RequestTimeline } from "@/components/tickets/request-timeline";
import { PriorityChip, StatusChip } from "@/components/tickets/chips";

/**
 * Read-only preview of a DELETED ticket, opened from a recycle-bin row.
 *
 * Deliberately NOT the live <TicketDetail> / <RequestDetail>: those carry action bars
 * (claim, start, resolve, comment) that must never operate on a deleted row, and they
 * are fed by reads that filter deleted tickets out anyway (§9). What an admin needs
 * here is the record itself — enough to decide between Restore and Delete for good.
 */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm text-foreground">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DeletedTicketDialog({
  ticketId,
  onOpenChange,
}: {
  /** null closes it; changing it reloads. */
  ticketId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<DeletedTicketDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    if (!ticketId) return;
    let active = true;
    setDetail(null);
    setState("loading");
    void loadDeletedTicketDetail(ticketId).then((res) => {
      // Ignore a stale response if the admin already opened another row.
      if (!active) return;
      setDetail(res.ok ? res.data : null);
      setState(res.ok ? "ready" : "error");
    });
    return () => {
      active = false;
    };
  }, [ticketId]);

  const ticketAttachments = (detail?.attachments ?? []).filter(
    (a) => !a.commentId
  );

  return (
    <Dialog open={!!ticketId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-text-muted">
              {detail?.number ?? "…"}
            </span>
            {detail ? (
              <>
                <StatusChip status={detail.status} />
                <PriorityChip priority={detail.priority} />
              </>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            Deleted ticket — read-only. Restore it to work on it again.
          </DialogDescription>
        </DialogHeader>

        {state === "loading" ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : null}

        {state === "error" ? (
          <p className="text-sm text-text-muted">
            This ticket could not be loaded — it may have been permanently deleted.
          </p>
        ) : null}

        {detail ? (
          <div className="space-y-5">
            {/* Files posted with a comment render inside that comment, below. */}
            <h2 className="font-display text-lg font-semibold leading-tight">
              {detail.title}
            </h2>

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-[var(--radius-input)] border border-border bg-surface-muted/40 p-3 sm:grid-cols-3">
              <Field
                label="Department"
                value={DEPARTMENT_LABELS[detail.department]}
              />
              <Field label="Reporter" value={detail.createdByName ?? "—"} />
              <Field
                label="Assignee"
                value={detail.assignedToName ?? "Unassigned"}
              />
              <Field
                label="Raised"
                value={<AbsoluteTime date={detail.createdAt} dateOnly />}
              />
              {detail.claimedAt ? (
                <Field
                  label="Claimed"
                  value={formatDueDate(detail.claimedAt) ?? "—"}
                />
              ) : null}
              {detail.startedAt ? (
                <Field
                  label="Started"
                  value={formatDueDate(detail.startedAt) ?? "—"}
                />
              ) : null}
              {detail.resolvedAt ? (
                <Field
                  label="Resolved"
                  value={formatDueDate(detail.resolvedAt) ?? "—"}
                />
              ) : null}
              {detail.deadline ? (
                <Field
                  label="Deadline"
                  value={formatDueDate(detail.deadline) ?? "—"}
                />
              ) : null}
              <Field
                label="Deleted"
                value={
                  <span>
                    {detail.deletedAt ? (
                      <AbsoluteTime date={detail.deletedAt} dateOnly />
                    ) : (
                      "—"
                    )}
                    {detail.deletedByName ? ` by ${detail.deletedByName}` : null}
                  </span>
                }
              />
            </dl>

            {/* An ISSUE carries its problem in `description`; a REQUEST's brief lives
                in request_details, so show whichever this one has. */}
            {detail.brief ? (
              <div className="space-y-4">
                <Block title="Problem">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {detail.brief.problemStatement}
                  </p>
                </Block>
                <Block title="Expected benefit">
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {detail.brief.expectedBenefit}
                  </p>
                </Block>
                {detail.brief.currentProcess ? (
                  <Block title="Current process">
                    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                      {detail.brief.currentProcess}
                    </p>
                  </Block>
                ) : null}
                {detail.brief.requestedBy ? (
                  <Block title="Requested by">
                    <p className="text-sm">{detail.brief.requestedBy}</p>
                  </Block>
                ) : null}
              </div>
            ) : (
              <Block title="Description">
                {detail.description?.trim() ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {detail.description}
                  </p>
                ) : (
                  <p className="text-sm italic text-text-muted">
                    No description provided.
                  </p>
                )}
              </Block>
            )}

            {detail.sheetLink ? (
              <Block title="System / sheet">
                {isUrl(detail.sheetLink) ? (
                  <a
                    href={detail.sheetLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="size-4" />
                    Open linked sheet
                  </a>
                ) : (
                  <p className="break-words text-sm">{detail.sheetLink}</p>
                )}
              </Block>
            ) : null}

            {ticketAttachments.length > 0 ? (
              <Block title="Attachments">
                <AttachmentGrid attachments={ticketAttachments} />
              </Block>
            ) : null}

            {/* The full trail, rendered by the SAME timeline the live detail uses —
                each module words its own events (§12.5), and a preview that showed a
                count instead of the history was the thing you could not act on. */}
            <Block title={detail.type === "REQUEST" ? "History" : "Activity"}>
              {detail.type === "REQUEST" ? (
                <RequestTimeline
                  activity={detail.activity}
                  comments={detail.comments}
                  attachments={detail.attachments}
                  claimedAt={detail.claimedAt ? toIso(detail.claimedAt) : null}
                  startedAt={detail.startedAt ? toIso(detail.startedAt) : null}
                />
              ) : (
                <ActivityTimeline
                  activity={detail.activity}
                  comments={detail.comments}
                  attachments={detail.attachments}
                  claimedAt={detail.claimedAt ? toIso(detail.claimedAt) : null}
                  startedAt={detail.startedAt ? toIso(detail.startedAt) : null}
                  resolvedAt={detail.resolvedAt ? toIso(detail.resolvedAt) : null}
                />
              )}
            </Block>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
