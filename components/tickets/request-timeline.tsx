import { AbsoluteTime } from "@/components/absolute-time";
import type { RequestDetail } from "@/lib/db/queries";
import { toIso } from "@/lib/format";

type ActivityRow = RequestDetail["activity"][number];
type CommentRow = RequestDetail["comments"][number];

const DUE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
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
      return `${actor} claimed the build`;
    case "UNCLAIMED":
      return `${actor} released the claim — back to the approved pool`;
    case "DEADLINE_SET":
      return a.toValue ? `${actor} set delivery for ${formatDue(a.toValue)}` : `${actor} set a delivery date`;
    case "STARTED":
      return `${actor} started building`;
    case "MARKED_COMPLETE":
      return `${actor} marked the build complete — ready to test`;
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
}: {
  activity: ActivityRow[];
  comments: CommentRow[];
}) {
  const items = [
    // PROGRESS_LOGGED + COMMENTED are shown as their own richer items below.
    ...activity
      .filter((a) => a.type !== "COMMENTED" && a.type !== "PROGRESS_LOGGED")
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
            <AbsoluteTime date={item.at} className="text-xs text-text-muted" />
          </li>
        );
      })}
    </ol>
  );
}
