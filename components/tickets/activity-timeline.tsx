import { RelativeTime } from "@/components/relative-time";
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

function describe(a: ActivityRow): string {
  const actor = a.actorName ?? "Someone";
  switch (a.type) {
    case "CREATED":
      return `${actor} raised the ticket`;
    case "ASSIGNED":
      return a.toValue
        ? `${actor} assigned it to ${a.toValue}`
        : `${actor} unassigned it`;
    case "STATUS_CHANGED":
      return `${actor} changed status: ${humanize(a.fromValue)} → ${humanize(a.toValue)}`;
    case "PRIORITY_CHANGED":
      return `${actor} changed priority: ${humanize(a.fromValue)} → ${humanize(a.toValue)}`;
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
                <RelativeTime date={item.at} className="text-text-muted" />
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
            <RelativeTime date={item.at} className="text-xs text-text-muted" />
          </li>
        )
      )}
    </ol>
  );
}
