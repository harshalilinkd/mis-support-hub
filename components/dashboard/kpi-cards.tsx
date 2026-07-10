import { CircleDot, Clock, Loader2, UserX, CircleCheck } from "lucide-react";

import type { DashboardStats } from "@/lib/db/queries";
import { CountUp } from "./count-up";

function formatHours(hours: number): string {
  if (!hours) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tint,
  delay,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="enter-up group rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)] transition-[transform,box-shadow,border-color] duration-200 will-change-transform hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-hover)]"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-text-muted">{label}</span>
        <div
          className="grid size-8 place-items-center rounded-[10px] transition-transform duration-200 group-hover:scale-110"
          style={{
            backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`,
            color: tint,
          }}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <div className="mt-3 font-mono text-[28px] font-semibold leading-none tabular-nums">
        {value}
      </div>
      <div className="mt-2 text-xs text-text-muted">{sub}</div>
    </div>
  );
}

export function KpiCards({ stats }: { stats: DashboardStats }) {
  const cards = [
    {
      label: "Open",
      value: <CountUp value={stats.open} />,
      sub: "awaiting triage",
      icon: CircleDot,
      tint: "var(--status-open)",
    },
    {
      label: "In Progress",
      value: <CountUp value={stats.inProgress} />,
      sub: "being worked on",
      icon: Loader2,
      tint: "var(--status-in-progress)",
    },
    {
      label: "Unassigned",
      value: <CountUp value={stats.unassigned} />,
      sub: "need an owner",
      icon: UserX,
      tint: "var(--priority-high)",
    },
    {
      label: "Resolved · 7d",
      value: <CountUp value={stats.resolvedLast7d} />,
      sub: "last 7 days",
      icon: CircleCheck,
      tint: "var(--status-resolved)",
    },
    {
      label: "Avg resolution",
      value: formatHours(stats.avgResolutionHours),
      sub: "created → resolved",
      icon: Clock,
      tint: "var(--accent)",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {cards.map((c, i) => (
        <Kpi key={c.label} {...c} delay={i * 70} />
      ))}
    </div>
  );
}
