import type { DashboardStats } from "@/lib/db/queries";

function formatHours(hours: number): string {
  if (!hours) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
      <div className="text-sm text-text-muted">{label}</div>
      <div className="mt-2 font-mono text-3xl font-medium tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function KpiCards({ stats }: { stats: DashboardStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Kpi label="Open" value={stats.open} />
      <Kpi label="In Progress" value={stats.inProgress} />
      <Kpi label="Unassigned" value={stats.unassigned} />
      <Kpi label="Resolved · 7d" value={stats.resolvedLast7d} />
      <Kpi label="Avg resolution" value={formatHours(stats.avgResolutionHours)} />
    </div>
  );
}
