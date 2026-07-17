import { AbsoluteTime } from "@/components/absolute-time";
import type { TicketDetail } from "@/lib/db/queries";
import { toIso } from "@/lib/format";

type ActivityRow = TicketDetail["activity"][number];
type CommentRow = TicketDetail["comments"][number];

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
    case "PRIORITY_CHANGED":
      return a.fromValue
        ? `${actor} changed priority: ${humanize(a.fromValue)} → ${humanize(a.toValue)}`
        : `${actor} set priority to ${humanize(a.toValue)}`;
    case "REOPENED":
      return `${actor} reopened the ticket`;
    case "EDITED":
      return `${actor} edited the ticket`;
    default:
      return `${actor} updated the ticket`;
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

/** Unified timeline: activity events + comment bodies, oldest first. */
export function ActivityTimeline({
  activity,
  comments,
}: {
  activity: ActivityRow[];
  comments: CommentRow[];
}) {
  const items = [
    ...activity
      .filter((a) => a.type !== "COMMENTED")
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
            </div>
          </li>
        ) : (
          <li key={item.id} className="flex items-center gap-3 text-sm">
            <span
              aria-hidden
              className="ml-2.5 size-1.5 shrink-0 rounded-full bg-border"
            />
            <span className="text-text-muted">{describe(item.row)}</span>
            <AbsoluteTime date={item.at} className="text-xs text-text-muted" />
          </li>
        )
      )}
    </ol>
  );
}
