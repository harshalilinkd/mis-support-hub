import type { Priority, Status } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const STATUS_META: Record<Status, { label: string; color: string }> = {
  OPEN: { label: "Open", color: "var(--status-open)" },
  IN_PROGRESS: { label: "In Progress", color: "var(--status-in-progress)" },
  REOPENED: { label: "Reopened", color: "var(--status-reopened)" },
  RESOLVED: { label: "Resolved", color: "var(--status-resolved)" },
  CLOSED: { label: "Closed", color: "var(--status-closed)" },
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
  priority: Priority;
  className?: string;
}) {
  const meta = PRIORITY_META[priority];
  return <Chip label={meta.label} color={meta.color} className={className} />;
}
