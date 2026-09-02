import { AbsoluteTime } from "@/components/absolute-time";
import { AttachmentGrid } from "./attachment-grid";
import type { TicketDetail } from "@/lib/db/queries";
import { istDayKey, toIso } from "@/lib/format";

type ActivityRow = TicketDetail["activity"][number];
type CommentRow = TicketDetail["comments"][number];

/**
 * An attachment, plus the comment it was posted with. `commentId` is the whole point:
 * ticket_attachments has carried it since the schema was written (§4), but nothing
 * rendered it, so a file posted with a reply landed in the ticket-level Attachments
 * grid — indistinguishable from what the reporter attached when raising the ticket.
 */
type AttachmentRow = {
  id: string;
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  commentId: string | null;
};

function humanize(value: string | null): string {
  if (!value) return "";
  return /^[A-Z_]+$/.test(value)
    ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ")
    : value;
}

// Deadlines are stored on the STARTED event as an ISO string; show them as a
// plain IST date (matches the AbsoluteTime date format used elsewhere).
const DUE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
// Date + time in IST, for the "Recorded …" tooltip on a picked date.
const RECORDED_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
function formatRecorded(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : RECORDED_FMT.format(d);
}

function formatDue(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : DUE_FMT.format(d);
}

function describe(a: ActivityRow): string {
  const actor = a.actorName ?? "Someone";
  switch (a.type) {
    case "CREATED":
      return `${actor} raised the ticket`;
    case "CLAIMED": {
      // A claim now only assigns + sets priority — no deadline (that's STARTED).
      const from = a.fromValue ? ` from ${a.fromValue}` : "";
      return `${actor} claimed the ticket${from}`;
    }
    case "STARTED": {
      // toValue holds the expected completion date (ISO); fromValue the prior
      // status (OPEN/REOPENED), which the transition implies — so we omit it.
      // The START DATE is not repeated here — it is the row's own date (§5.3).
      const due = a.toValue ? ` · due by ${formatDue(a.toValue)}` : "";
      return `${actor} started work${due}`;
    }
    case "UNCLAIMED":
      // Undid a claim — back to the unclaimed open pool (assignee/priority cleared).
      return `${actor} released the ticket back to Open`;
    case "ASSIGNED":
      if (!a.toValue) return `${actor} unassigned it`;
      // A self-assignment reads as a claim (covers historical rows written before
      // CLAIMED existed); a genuine hand-off keeps "assigned it to <name>".
      if (a.actorName && a.toValue === a.actorName) {
        return `${actor} claimed the ticket`;
      }
      return `${actor} assigned it to ${a.toValue}`;
    case "STATUS_CHANGED":
      return `${actor} changed status: ${humanize(a.fromValue)} → ${humanize(a.toValue)}`;
    case "CLAIM_DATED":
      // Written only when the claim was dated to a day OTHER than today (§5.3).
      return `${actor} dated the claim ${formatDue(a.toValue)}`;
    case "START_DATED":
      // Written only when the start was dated to a day OTHER than today (§5.3);
      // toValue is that date, and this row's own timestamp is when it was recorded.
      return `${actor} dated the start ${formatDue(a.toValue)}`;
    case "COMPLETION_DATED":
      // Written only when the resolution was dated to a day OTHER than today (§5.2).
      // toValue is that date; the row's own created_at (rendered beside this line) is
      // when it was recorded, so the two together show the gap.
      return `${actor} dated the resolution ${formatDue(a.toValue)}`;
    case "PRIORITY_CHANGED":
      return a.fromValue
        ? `${actor} changed priority: ${humanize(a.fromValue)} → ${humanize(a.toValue)}`
        : `${actor} set priority to ${humanize(a.toValue)}`;
    case "REOPENED":
      return `${actor} reopened the ticket`;
    case "EDITED":
      return `${actor} edited the ticket`;
    case "MOVED":
      return a.fromValue && a.toValue
        ? `${actor} moved this from ${a.fromValue} to ${a.toValue}`
        : `${actor} moved this between modules`;
    case "AUTO_CLOSED":
      return "Closed automatically — no changes requested, treated as resolved";
    default:
      return `${actor} updated the ticket`;
  }
}

/**
 * The DATE an event happened on, as MIS recorded it (§5.3) — the claim / start /
 * resolution day THEY picked, not the moment the row was written. One date per line:
 * the picked day replaces the timestamp rather than sitting beside it.
 *
 * Events nobody dates (raised, priority changed, edited, comments) return null and keep
 * their real timestamp, which for those IS when they happened.
 */
function eventDate(
  a: ActivityRow,
  dates: TicketDates
): string | null {
  switch (a.type) {
    case "CLAIMED":
      return dates.claimedAt ?? null;
    case "STARTED":
      return dates.startedAt ?? null;
    case "STATUS_CHANGED":
      // Only the resolve carries a picked date; other status moves are immediate.
      return a.toValue === "RESOLVED" ? (dates.resolvedAt ?? null) : null;
    default:
      return null;
  }
}

/**
 * The audit rows behind those picked dates (§12.5). They stay in the database — they
 * are the record of WHO chose a date and WHEN they entered it — but they are not
 * rendered: the line they annotate now shows that date itself, so a row saying
 * "dated the start 07 Aug 2026" directly above "started work … 07 Aug 2026" is pure
 * duplication. The recording time survives in the date's tooltip.
 */
const DATED_TYPES = ["CLAIM_DATED", "START_DATED", "COMPLETION_DATED"];

type TicketDates = {
  claimedAt?: string | null;
  startedAt?: string | null;
  resolvedAt?: string | null;
};

function initials(name: string | null): string {
  const base = (name ?? "?").trim();
  const parts = base.split(/\s+/);
  return (
    parts.length >= 2 && parts[0] && parts[1]
      ? parts[0][0] + parts[1][0]
      : base.slice(0, 2)
  ).toUpperCase();
}

/** Unified timeline: activity events + comment bodies, oldest first. */
export function ActivityTimeline({
  activity,
  comments,
  startedAt,
  claimedAt,
  resolvedAt,
  attachments,
}: {
  activity: ActivityRow[];
  comments: CommentRow[];
  /**
   * The ticket's recorded start date (§5.3), shown on the STARTED line. It lives on
   * the ticket row rather than the event, so a ticket started → released → re-started
   * shows the CURRENT start date on the older STARTED row too; the START_DATED rows
   * keep the exact per-event trail.
   */
  startedAt?: string | null;
  /** The ticket's recorded claim date (§5.3), shown on the CLAIMED line. */
  claimedAt?: string | null;
  /** The recorded resolution date (§5.2), shown on the → Resolved status line. */
  resolvedAt?: string | null;
  /**
   * Every attachment on the ticket. Those with a `commentId` render INSIDE that
   * comment; the caller keeps the rest for its own Attachments section.
   */
  attachments?: AttachmentRow[];
}) {
  // One pass, so a thread with many comments doesn't re-scan the list per bubble.
  const filesByComment = new Map<string, AttachmentRow[]>();
  for (const a of attachments ?? []) {
    if (!a.commentId) continue;
    const list = filesByComment.get(a.commentId);
    if (list) list.push(a);
    else filesByComment.set(a.commentId, [a]);
  }
  const dates: TicketDates = { claimedAt, startedAt, resolvedAt };
  const items = [
    ...activity
      .filter((a) => a.type !== "COMMENTED" && !DATED_TYPES.includes(a.type))
      .map((a) => ({ kind: "activity" as const, id: a.id, at: toIso(a.createdAt), row: a })),
    ...comments.map((c) => ({
      kind: "comment" as const,
      id: c.id,
      at: toIso(c.createdAt),
      row: c,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  if (items.length === 0) {
    return <p className="text-sm text-text-muted">No activity yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {items.map((item) =>
        item.kind === "comment" ? (
          <li key={item.id} className="flex gap-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-medium text-primary">
              {initials(item.row.authorName)}
            </div>
            <div className="min-w-0 flex-1 rounded-[var(--radius-input)] border border-border bg-surface p-3">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-medium">
                  {item.row.authorName ?? "Unknown"}
                </span>
                <AbsoluteTime date={item.at} className="text-text-muted" />
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                {item.row.body}
              </p>
              {/* Files posted WITH this comment, shown with it — the same grid and
                  lightbox as the ticket's own attachments. */}
              {(filesByComment.get(item.row.id)?.length ?? 0) > 0 ? (
                <div className="mt-3">
                  <AttachmentGrid
                    attachments={filesByComment.get(item.row.id) ?? []}
                  />
                </div>
              ) : null}
            </div>
          </li>
        ) : (
          <li key={item.id} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden
              className="ml-2.5 size-1.5 shrink-0 rounded-full bg-border"
            />
            <span className="text-text-muted">
              {describe(item.row)}
            </span>
            <EventDate row={item.row} at={item.at} dates={dates} />
          </li>
        )
      )}
    </ol>
  );
}

/**
 * One date per activity line. A picked claim/start/resolution day renders as a plain
 * date (no clock time — MIS chose a DAY, and the stored instant is just that day's
 * boundary, so a time would be invented precision). Anything else keeps its real
 * timestamp. When the two differ, the tooltip carries when it was recorded, so the
 * backdate is still discoverable without a second date on the line.
 */
function EventDate({
  row,
  at,
  dates,
}: {
  row: ActivityRow;
  at: string;
  dates: TicketDates;
}) {
  const picked = eventDate(row, dates);
  if (!picked) {
    // Date only, never a clock time: the timeline answers "when did this happen" at
    // day resolution, and a time on some rows but not others (the dated ones can't
    // have one) made the column read inconsistently. The exact instant stays in the
    // tooltip for anyone who needs it.
    return (
      <span className="text-xs text-text-muted" title={formatRecorded(at)}>
        <AbsoluteTime date={at} dateOnly className="text-xs text-text-muted" />
      </span>
    );
  }
  const moved = istDayKey(picked) !== istDayKey(at);
  return (
    <span
      className="text-xs text-text-muted"
      title={moved ? `Recorded ${formatRecorded(at)}` : undefined}
    >
      <AbsoluteTime date={picked} dateOnly className="text-xs text-text-muted" />
    </span>
  );
}
