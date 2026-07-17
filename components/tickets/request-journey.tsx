import { Check, X } from "lucide-react";

import type { RequestDetail } from "@/lib/db/queries";
import type { ActivityType, Status } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

type ActivityRow = RequestDetail["activity"][number];

/**
 * The request journey (§12.3) as a compact strip: Submitted → Review → Approval →
 * Claimed → In progress → Testing → Closed. Completed stages tick, the current one
 * is accented, and each stage carries its timestamp on hover — read from the audit
 * trail (§12.5), so the strip can never disagree with what actually happened.
 */

const STAGES: { label: string; enteredBy: ActivityType }[] = [
  { label: "Submitted", enteredBy: "SUBMITTED" },
  { label: "Review", enteredBy: "MOVED_TO_REVIEW" },
  { label: "Approval", enteredBy: "SENT_FOR_APPROVAL" },
  { label: "Claimed", enteredBy: "CLAIMED" },
  { label: "In progress", enteredBy: "STARTED" },
  { label: "Testing", enteredBy: "MARKED_COMPLETE" },
  { label: "Closed", enteredBy: "ACCEPTED" },
];

/** The last stage index a request has reached, from its current status. */
const STAGE_OF: Record<Status, number> = {
  SUBMITTED: 0,
  UNDER_REVIEW: 1,
  PENDING_MD_APPROVAL: 2,
  // Approved but not yet claimed — the approval stage is where it sits.
  APPROVED: 2,
  DROPPED: 2,
  CLAIMED: 3,
  IN_PROGRESS: 4,
  // A revision loops back into the build, so it reads as "In progress".
  CHANGES_REQUESTED: 4,
  IN_TESTING: 5,
  CLOSED: 6,
  // ISSUE-only statuses never occur on a REQUEST.
  OPEN: 0,
  RESOLVED: 0,
  REOPENED: 0,
};

// Fixed timezone + locale → deterministic on server and client (§9, no hydration drift).
const TS_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function RequestJourney({
  status,
  activity,
}: {
  status: Status;
  activity: ActivityRow[];
}) {
  const current = STAGE_OF[status] ?? 0;
  const dropped = status === "DROPPED";

  // First occurrence of each stage's entering event (a revision can repeat some).
  const stampFor = (type: ActivityType): string | null => {
    const row = activity.find((a) => a.type === type);
    if (!row) return null;
    const d = new Date(row.createdAt);
    return Number.isNaN(d.getTime()) ? null : `${TS_FMT.format(d)} IST`;
  };

  return (
    <ol
      aria-label="Request progress"
      className="flex w-full items-center gap-1 overflow-x-auto rounded-[var(--radius-input)] border border-border bg-surface-muted/40 px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {STAGES.map((stage, i) => {
        const done = i < current;
        const isCurrent = i === current;
        // A dropped request stops at Approval — nothing after it is reachable.
        const stalled = dropped && isCurrent;
        const stamp = stampFor(stage.enteredBy);
        return (
          <li key={stage.label} className="flex shrink-0 items-center gap-1">
            <span
              title={stamp ?? "Not reached yet"}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "inline-flex cursor-default items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium transition-colors",
                stalled && "bg-destructive/10 text-destructive",
                !stalled && isCurrent && "bg-accent-soft text-primary",
                !stalled && done && "text-foreground",
                !isCurrent && !done && "text-text-muted"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-3.5 shrink-0 place-items-center rounded-full",
                  stalled && "bg-destructive text-white",
                  !stalled && done && "bg-[var(--status-resolved)] text-white",
                  !stalled && isCurrent && "bg-primary text-white",
                  !isCurrent && !done && "border border-border"
                )}
              >
                {stalled ? (
                  <X className="size-2.5" strokeWidth={3} />
                ) : done ? (
                  <Check className="size-2.5" strokeWidth={3} />
                ) : null}
              </span>
              {stalled ? "Dropped" : stage.label}
            </span>
            {i < STAGES.length - 1 ? (
              <span
                aria-hidden
                className={cn("h-px w-3 shrink-0", done ? "bg-[var(--status-resolved)]" : "bg-border")}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
