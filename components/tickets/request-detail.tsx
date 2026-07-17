"use client";

import { CheckCircle2, ExternalLink, XCircle } from "lucide-react";

import { AbsoluteTime } from "@/components/absolute-time";
import { UserAvatar } from "@/components/user-avatar";
import type { RequestDetail as RequestDetailData } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { formatDueDate, isUrl } from "@/lib/format";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { AttachmentGrid } from "./attachment-grid";
import { PriorityChip, StatusChip, TypeChip } from "./chips";
import { CommentComposer } from "./comment-composer";
import { RequestActions } from "./request-actions";
import { RequestBuildPanel } from "./request-build-panel";
import { RequestHistory } from "./request-history";
import { RequestJourney } from "./request-journey";
import { RequestProgress } from "./request-progress";
import { RequestTimeline } from "./request-timeline";
import { RequestUatPanel } from "./request-uat-panel";

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

export function RequestDetail({
  request,
  currentUser,
  onMutate,
}: {
  request: RequestDetailData;
  currentUser: SessionUser;
  onMutate?: () => void;
}) {
  // Key the banner off the CURRENT status, never off mdDecision: a revive leaves
  // md_decision = REJECTED behind, so keying on the decision would keep showing a
  // red "dropped" banner on a request that is back under review (§12.3/§12.7).
  const dropped = request.status === "DROPPED";
  const approved = request.status === "APPROVED";
  const decided = dropped || approved;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-text-muted">{request.number}</span>
          <TypeChip type="REQUEST" />
          <StatusChip status={request.status} />
          <PriorityChip priority={request.priority} />
          {/* Revision counter — the UAT loop is uncapped, so how many times it came
              back is front-page information (§12.5). */}
          {request.revisionRound > 0 ? (
            <span
              title={`Sent back for changes ${request.revisionRound} time(s)`}
              className="inline-flex items-center rounded-[var(--radius-chip)] bg-[color-mix(in_srgb,var(--priority-high)_14%,transparent)] px-2 py-0.5 text-xs font-medium text-[var(--priority-high)]"
            >
              Round {request.revisionRound + 1}
            </span>
          ) : null}
        </div>
        <h1 className="mt-2 font-display text-2xl font-semibold">{request.systemName}</h1>
      </div>

      {/* The journey so far (§12.3) — current stage highlighted, done stages ticked. */}
      <RequestJourney status={request.status} activity={request.activity} />

      {/* Meta */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Meta label="Department">{DEPARTMENT_LABELS[request.department]}</Meta>
        <Meta label="Requester">
          <span className="inline-flex items-center gap-1.5">
            <UserAvatar name={request.createdByName} image={request.createdByImage} />
            {request.createdByName ?? "—"}
          </span>
        </Meta>
        <Meta label="Building">
          {request.assignedToId ? (
            <span className="inline-flex items-center gap-1.5">
              <UserAvatar name={request.assignedToName} image={request.assignedToImage} />
              {request.assignedToName ?? "—"}
            </span>
          ) : (
            <span className="text-text-muted">Unassigned</span>
          )}
        </Meta>
        <Meta label="Submitted">
          <AbsoluteTime date={request.createdAt} dateOnly className="font-mono" />
        </Meta>
        {request.deadline ? (
          <Meta label="Delivery target">{formatDueDate(request.deadline)}</Meta>
        ) : null}
        {request.revisionRound > 0 ? (
          <Meta label="Revisions">{request.revisionRound}</Meta>
        ) : null}
      </dl>

      {/* Claim it (APPROVED + unclaimed), or who's building it and by when. */}
      <RequestBuildPanel request={request} currentUser={currentUser} onMutate={onMutate} />

      {/* IN_TESTING — the requester accepts or sends it back. MIS sees a read-only
          waiting state: only the requester's acceptance closes a request (§12.4). */}
      <RequestUatPanel request={request} currentUser={currentUser} onMutate={onMutate} />

      {/* Workflow actions */}
      <RequestActions request={request} currentUser={currentUser} onMutate={onMutate} />

      {/* Recorded approval outcome. When DROPPED this is the §12.7 banner: the
          remark (if any) + who recorded the MD's decision and when. */}
      {decided ? (
        <div
          className="flex items-start gap-2.5 rounded-[var(--radius-input)] border p-3 text-sm"
          style={{
            borderColor: approved ? "var(--status-resolved)" : "var(--priority-urgent)",
            backgroundColor: `color-mix(in srgb, ${approved ? "var(--status-resolved)" : "var(--priority-urgent)"} 8%, transparent)`,
          }}
        >
          {approved ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: "var(--status-resolved)" }} />
          ) : (
            <XCircle className="mt-0.5 size-4 shrink-0" style={{ color: "var(--priority-urgent)" }} />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              {approved
                ? "Approved — ready for an MIS member to claim"
                : "This request was dropped"}
            </p>
            {request.mdRemark ? (
              <p className="mt-1 whitespace-pre-wrap break-words">“{request.mdRemark}”</p>
            ) : null}
            <p className="mt-1 text-xs text-text-muted">
              Decision recorded on the MD&apos;s behalf by{" "}
              <span className="font-medium text-foreground">
                {request.mdDecidedByName ?? "an MIS admin"}
              </span>
              {request.mdDecidedAt ? (
                <>
                  {" on "}
                  <AbsoluteTime date={request.mdDecidedAt} dateOnly className="font-mono" />
                </>
              ) : null}
            </p>
          </div>
        </div>
      ) : null}

      {/* The brief */}
      <Section title="Problem it solves">
        <p className="whitespace-pre-wrap break-words text-sm text-foreground">{request.problemStatement}</p>
      </Section>

      <div className="grid gap-4 sm:grid-cols-2">
        {request.currentProcess ? (
          <Section title="How it's handled today">
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">{request.currentProcess}</p>
          </Section>
        ) : null}
        <Section title="Expected benefit">
          <p className="whitespace-pre-wrap break-words text-sm text-foreground">{request.expectedBenefit}</p>
        </Section>
        {request.currentSheetLink ? (
          <Section title="Current sheet / app">
            {/* The field accepts a URL OR a plain system name — only anchor a real
                link (shared isUrl guard), otherwise render it as text. */}
            {isUrl(request.currentSheetLink) ? (
              <a
                href={request.currentSheetLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Open current sheet
              </a>
            ) : (
              <p className="break-words text-sm text-foreground">
                {request.currentSheetLink}
              </p>
            )}
          </Section>
        ) : null}
      </div>

      {/* Attachments */}
      {request.attachments.length > 0 ? (
        <Section title="Attachments">
          <AttachmentGrid attachments={request.attachments} />
        </Section>
      ) : null}

      {/* Progress — the MIS team's structured build record (P12 item 2). Kept
          separate from the conversation below; they are different concepts. */}
      <RequestProgress request={request} currentUser={currentUser} onMutate={onMutate} />

      {/* The two-way conversation + audit trail. Open at every stage from SUBMITTED
          onwards — requester and MIS both comment and attach here (P12 item 3). */}
      <Section title="Conversation">
        <RequestTimeline activity={request.activity} comments={request.comments} />
        <div className="mt-4">
          <CommentComposer ticketId={request.id} onDone={onMutate} />
        </div>
      </Section>

      {/* The whole story in one chronological, exportable stream (§12.5). */}
      <RequestHistory request={request} />
    </div>
  );
}
