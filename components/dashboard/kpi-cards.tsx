import {
  CheckCheck,
  CircleDot,
  Clock,
  Loader2,
  UserX,
  CircleCheck,
} from "lucide-react";

import type { DashboardStats } from "@/lib/db/queries";
import { CountUp } from "./count-up";
import { KpiSparkline } from "./kpi-sparkline";

function formatHours(hours: number): string {
  if (!hours) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

/** Daily trend series (one per card) that feed the sparklines — derived in the
 *  dashboard page from the existing ticket list, aligned to the cards by key. */
export type KpiSparks = {
  open: number[];
  inProgress: number[];
  unassigned: number[];
  resolvedLast7d: number[];
  closed: number[];
  avgResolution: number[];
};

function Kpi({
  label,
  value,
  sub,
  icon: Icon,
  tint,
  spark,
  delay,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  spark: number[];
  delay: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className="enter-up group flex flex-col rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-[var(--shadow-elevation)] transition-[transform,box-shadow,border-color] duration-200 will-change-transform hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-hover)] sm:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-text-muted">
          {label}
        </span>
        <div
          className="grid size-7 shrink-0 place-items-center rounded-[8px] transition-transform duration-200 group-hover:scale-110"
          style={{
            backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`,
            color: tint,
          }}
        >
          <Icon className="size-3.5" />
        </div>
      </div>
      <div className="mt-2 font-mono text-xl font-semibold leading-none tabular-nums sm:text-2xl">
        {value}
      </div>
      <div className="mt-1 truncate text-xs text-text-muted">{sub}</div>
      {/* Sparkline — the card's metric over the recent window, tinted to match. */}
      <div className="-mx-1 mt-2">
        <KpiSparkline data={spark} color={tint} />
      </div>
    </div>
  );
}

export function KpiCards({
  stats,
  sparks,
}: {
  stats: DashboardStats;
  sparks: KpiSparks;
}) {
  const cards = [
    {
      label: "Open",
      value: <CountUp value={stats.open} />,
      sub: "awaiting triage",
      icon: CircleDot,
      tint: "var(--status-open)",
      spark: sparks.open,
    },
    {
      label: "In Progress",
      value: <CountUp value={stats.inProgress} />,
      sub: "being worked on",
      icon: Loader2,
      tint: "var(--status-in-progress)",
      spark: sparks.inProgress,
    },
    {
      label: "Unassigned",
      value: <CountUp value={stats.unassigned} />,
      sub: "need an owner",
      icon: UserX,
      tint: "var(--priority-high)",
      spark: sparks.unassigned,
    },
    {
      label: "Resolved · 7d",
      value: <CountUp value={stats.resolvedLast7d} />,
      sub: "last 7 days",
      icon: CircleCheck,
      tint: "var(--status-resolved)",
      spark: sparks.resolvedLast7d,
    },
    {
      label: "Closed",
      value: <CountUp value={stats.closed} />,
      sub: "confirmed & done",
      icon: CheckCheck,
      tint: "var(--status-closed)",
      spark: sparks.closed,
    },
    {
      label: "Avg resolution",
      value: formatHours(stats.avgResolutionHours),
      sub: "created → resolved",
      icon: Clock,
      tint: "var(--accent)",
      spark: sparks.avgResolution,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
      {cards.map((c, i) => (
        <Kpi key={c.label} {...c} delay={i * 70} />
      ))}
    </div>
  );
}
