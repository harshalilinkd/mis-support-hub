import type { Priority, Status, TicketType } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

// Single source of truth for status label + colour across chips, list accents,
// and cards. Both machines share this map (CLAUDE.md §5 + §12); reserved tokens
// are reused and the chip label always disambiguates same-coloured states.
export const STATUS_META: Record<Status, { label: string; color: string }> = {
  // ISSUE
  OPEN: { label: "Open", color: "var(--status-open)" },
  IN_PROGRESS: { label: "In Progress", color: "var(--status-in-progress)" },
  REOPENED: { label: "Reopened", color: "var(--status-reopened)" },
  RESOLVED: { label: "Resolved", color: "var(--status-resolved)" },
  CLOSED: { label: "Closed", color: "var(--status-closed)" },
  // REQUEST (§12.3)
  SUBMITTED: { label: "Submitted", color: "var(--status-open)" },
  UNDER_REVIEW: { label: "Under Review", color: "var(--status-in-progress)" },
  PENDING_MD_APPROVAL: { label: "Pending MD", color: "var(--priority-high)" },
  APPROVED: { label: "Approved", color: "var(--status-resolved)" },
  DROPPED: { label: "Dropped", color: "var(--priority-urgent)" },
  CLAIMED: { label: "Claimed", color: "var(--status-in-progress)" },
  IN_TESTING: { label: "In Testing", color: "var(--priority-high)" },
  CHANGES_REQUESTED: { label: "Changes Requested", color: "var(--priority-urgent)" },
};

/** The reserved colour for a status — used by list-row accents and cards. */
export function statusColor(status: Status): string {
  return STATUS_META[status].color;
}

const TYPE_META: Record<TicketType, { label: string; color: string }> = {
  ISSUE: { label: "Issue", color: "var(--status-in-progress)" },
  REQUEST: { label: "Request", color: "var(--priority-high)" },
};

const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  LOW: { label: "Low", color: "var(--priority-low)" },
  MEDIUM: { label: "Medium", color: "var(--priority-medium)" },
  HIGH: { label: "High", color: "var(--priority-high)" },
  URGENT: { label: "Urgent", color: "var(--priority-urgent)" },
};

// Chips carry a colored dot AND a text label — never colour-only (design-system.md).
function Chip({
  label,
  color,
  className,
}: {
  label: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-border bg-surface px-2 py-0.5 text-xs font-medium",
        className
      )}
    >
      <span
        aria-hidden
        className="size-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

export function StatusChip({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return <Chip label={meta.label} color={meta.color} className={className} />;
}

export function PriorityChip({
  priority,
  className,
}: {
  priority: Priority | null;
  className?: string;
}) {
  // null = not triaged yet (MIS sets priority on claim).
  if (!priority) {
    return (
      <Chip
        label="Unset"
        color="var(--text-muted)"
        className={cn("text-text-muted", className)}
      />
    );
  }
  const meta = PRIORITY_META[priority];
  return <Chip label={meta.label} color={meta.color} className={className} />;
}

/** ISSUE vs REQUEST badge — distinguishes the two request types in shared views. */
export function TypeChip({
  type,
  className,
}: {
  type: TicketType;
  className?: string;
}) {
  const meta = TYPE_META[type];
  return <Chip label={meta.label} color={meta.color} className={className} />;
}
