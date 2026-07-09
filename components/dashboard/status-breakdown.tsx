import type { DashboardStats } from "@/lib/db/queries";

const ROWS = [
  { label: "Open", key: "open", color: "var(--status-open)" },
  { label: "In Progress", key: "inProgress", color: "var(--status-in-progress)" },
  { label: "Resolved", key: "resolved", color: "var(--status-resolved)" },
  { label: "Closed", key: "closed", color: "var(--status-closed)" },
] as const;

export function StatusBreakdown({ stats }: { stats: DashboardStats }) {
  const values = ROWS.map((r) => stats[r.key]);
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...values);

  return (
    <div className="mt-4 space-y-3.5">
      {ROWS.map((r) => {
        const value = stats[r.key];
        return (
          <div key={r.key}>
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1.5 text-text-muted">
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: r.color }}
                />
                {r.label}
              </span>
              <span className="font-mono font-medium tabular-nums">{value}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${(value / max) * 100}%`,
                  backgroundColor: r.color,
                }}
              />
            </div>
          </div>
        );
      })}
      <div className="pt-1 text-xs text-text-muted">
        {total} {total === 1 ? "ticket" : "tickets"} total
      </div>
    </div>
  );
}
