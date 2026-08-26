import { AbsoluteTime } from "@/components/absolute-time";
import type { RequestDetail } from "@/lib/db/queries";
import { istDayKey, toIso } from "@/lib/format";

type ActivityRow = RequestDetail["activity"][number];
type CommentRow = RequestDetail["comments"][number];

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

/** The REQUEST lifecycle, told from the audit trail (CLAUDE.md §12.5). */
function describe(a: ActivityRow): string {
  const actor = a.actorName ?? "Someone";
  switch (a.type) {
    case "SUBMITTED":
      return `${actor} submitted the request`;
    case "MOVED_TO_REVIEW":
      return `${actor} moved it into review`;
    case "SENT_FOR_APPROVAL":
      return `${actor} sent it for approval`;
    case "APPROVAL_RECORDED":
      return `${actor} recorded the decision: Approved`;
    case "REJECTION_RECORDED":
      return `${actor} recorded the decision: Rejected`;
    case "DROPPED":
      return `${actor} dropped the request`;
    case "REVIVED":
      return `${actor} revived the request`;
    case "CLAIMED":
      // The claim DATE is the row's own date (§5.3) — never repeated in the sentence.
      return `${actor} claimed the build`;
    case "UNCLAIMED":
      return `${actor} released the claim — back to the approved pool`;
    case "DEADLINE_SET":
      return a.toValue ? `${actor} set delivery for ${formatDue(a.toValue)}` : `${actor} set a delivery date`;
    case "STARTED":
      return `${actor} started building`;
    case "MARKED_COMPLETE":
      return `${actor} marked the build complete — ready to test`;
    case "CLAIM_DATED":
      // Written only when the claim was dated to a day OTHER than today (§5.3).
      return `${actor} dated the claim ${formatDue(a.toValue)}`;
    case "START_DATED":
      // Written only when the start was dated to a day OTHER than today (§5.3).
      return `${actor} dated the start ${formatDue(a.toValue)}`;
    case "COMPLETION_DATED":
      // Written only when the completion was dated to a day OTHER than today (§5.2);
      // toValue is that date, and this row's own timestamp is when it was recorded.
      return `${actor} dated the completion ${formatDue(a.toValue)}`;
    case "CHANGES_REQUESTED":
      return `${actor} requested changes${a.toValue ? ` (round ${a.toValue})` : ""}`;
    case "ACCEPTED":
      return `${actor} accepted the build`;
    case "MOVED":
      return a.fromValue && a.toValue
        ? `${actor} moved this from ${a.fromValue} to ${a.toValue}`
        : `${actor} moved this between modules`;
    case "AUTO_CLOSED":
      return "Closed automatically — no changes requested, accepted on the requester's behalf";
    case "REOPENED":
      return `${actor} reopened this — back for testing`;
    default:
      return `${actor} updated the request`;
  }
}

type RequestDates = {
  claimedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
};

/**
 * The DATE an event happened on, as MIS recorded it (§5.3) — the claim / start /
 * completion day THEY picked, not when the row was written. Mirrors the ISSUE
 * timeline: one date per line, the picked one.
 */
function eventDate(a: ActivityRow, dates: RequestDates): string | null {
  switch (a.type) {
    case "CLAIMED":
      return dates.claimedAt ?? null;
    case "STARTED":
      return dates.startedAt ?? null;
    case "MARKED_COMPLETE":
      return dates.completedAt ?? null;
    default:
      return null;
  }
}

/** Audit rows for those picked dates — kept in the DB (§12.5), not rendered here. */
const DATED_TYPES = ["CLAIM_DATED", "START_DATED", "COMPLETION_DATED"];

function initials(name: string | null): string {
  const base = (name ?? "?").trim();
  const parts = base.split(/\s+/);
  return (
    parts.length >= 2 && parts[0] && parts[1]
      ? parts[0][0] + parts[1][0]
      : base.slice(0, 2)
  ).toUpperCase();
}

/**
 * The request's audit trail + the two-way conversation, oldest first. Progress logs
 * are deliberately NOT merged in here — they are the MIS team's structured build
 * record and live in their own Progress section (P12); this is the conversation.
 */
export function RequestTimeline({
  activity,
  comments,
  claimedAt,
  startedAt,
  completedAt,
}: {
  activity: ActivityRow[];
  comments: CommentRow[];
  /**
   * The request's recorded claim / start days (§5.3), shown on the CLAIMED and
   * STARTED lines. They live on request_details rather than on the events, so a
   * re-claim after a release shows the CURRENT dates on older rows; the
   * CLAIM_DATED / START_DATED rows keep the exact per-event trail.
   */
  claimedAt?: string | null;
  startedAt?: string | null;
  /** The recorded completion date (§5.2), shown on the MARKED_COMPLETE line. */
  completedAt?: string | null;
}) {
  const dates: RequestDates = { claimedAt, startedAt, completedAt };
  const items = [
    // PROGRESS_LOGGED + COMMENTED are shown as their own richer items below.
    ...activity
      .filter(
        (a) =>
          a.type !== "COMMENTED" &&
          a.type !== "PROGRESS_LOGGED" &&
          !DATED_TYPES.includes(a.type)
      )
      .map((a) => ({ kind: "activity" as const, id: `a-${a.id}`, at: toIso(a.createdAt), row: a })),
    ...comments.map((c) => ({ kind: "comment" as const, id: `c-${c.id}`, at: toIso(c.createdAt), row: c })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  if (items.length === 0) {
    return <p className="text-sm text-text-muted">No activity yet.</p>;
  }

  return (
    <ol className="space-y-4">
      {items.map((item) => {
        if (item.kind === "comment") {
          return (
            <li key={item.id} className="flex gap-3">
              <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-medium text-primary">
                {initials(item.row.authorName)}
              </div>
              <div className="min-w-0 flex-1 rounded-[var(--radius-input)] border border-border bg-surface p-3">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-medium">{item.row.authorName ?? "Unknown"}</span>
                  <AbsoluteTime date={item.at} className="text-text-muted" />
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.row.body}</p>
              </div>
            </li>
          );
        }
        return (
          <li key={item.id} className="flex items-center gap-3 text-sm">
            <span aria-hidden className="ml-2.5 size-1.5 shrink-0 rounded-full bg-border" />
            <span className="text-text-muted">{describe(item.row)}</span>
            <EventDate row={item.row} at={item.at} dates={dates} />
          </li>
        );
      })}
    </ol>
  );
}

/** One date per line — the picked claim/start/completion day, else the timestamp. */
function EventDate({
  row,
  at,
  dates,
}: {
  row: ActivityRow;
  at: string;
  dates: RequestDates;
}) {
  const picked = eventDate(row, dates);
  if (!picked) {
    return <AbsoluteTime date={at} className="text-xs text-text-muted" />;
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
