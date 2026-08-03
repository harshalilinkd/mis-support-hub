import {
  AlarmClock,
  FlaskConical,
  Hammer,
  RotateCcw,
  Stamp,
  ThumbsUp,
} from "lucide-react";

import type { RequestStats } from "@/lib/db/analytics";
import { CountUp } from "./count-up";

/**
 * REQUEST pipeline KPIs (§12) — the request-side mirror of the issue KPI row.
 * Same bento/card language as KpiCards; no charts (the request pipeline is a
 * funnel of counts, and a stat tile is the honest form for a single number).
 */
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
      className="enter-up group rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-[var(--shadow-elevation)] transition-[transform,box-shadow,border-color] duration-200 will-change-transform hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-hover)] sm:p-4"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
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
      <div className="mt-1 truncate text-xs text-foreground/70">{sub}</div>
    </div>
  );
}

export function RequestKpiCards({ stats }: { stats: RequestStats }) {
  const cards = [
    {
      label: "Awaiting approval",
      value: <CountUp value={stats.awaitingApproval} />,
      sub: "needs the MD verdict recorded",
      icon: Stamp,
      tint: "var(--status-open)",
    },
    {
      label: "Approved",
      value: <CountUp value={stats.approvedUnclaimed} />,
      sub: "unclaimed — needs a builder",
      icon: ThumbsUp,
      tint: "var(--status-resolved)",
    },
    {
      label: "In progress",
      value: <CountUp value={stats.inProgress} />,
      sub: "being built",
      icon: Hammer,
      tint: "var(--status-in-progress)",
    },
    {
      label: "In testing",
      value: <CountUp value={stats.inTesting} />,
      sub: "with the requester",
      icon: FlaskConical,
      tint: "var(--priority-high)",
    },
    {
      label: "Overdue",
      value: <CountUp value={stats.overdue} />,
      sub: "past the delivery date",
      icon: AlarmClock,
      tint: "var(--priority-urgent)",
    },
    {
      label: "Avg rounds",
      // One decimal — "1.5 rounds" is meaningful, "2" would over-round it.
      value: stats.avgRoundsToAcceptance.toFixed(1),
      sub: "revisions before acceptance",
      icon: RotateCcw,
      tint: "var(--accent)",
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
