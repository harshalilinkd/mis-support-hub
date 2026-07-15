"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  CHART,
  ChartEmpty,
  ChartSkeleton,
  ChartTooltip,
  axisTick,
  useMounted,
  usePrefersReducedMotion,
} from "./chart-shell";

export type ResolutionWeek = { week: string; hours: number | null };

const H = 240;

/** Compact hours → "45m" / "12.5h" / "3.2d" for the axis + tooltip. */
function fmtHours(h: number): string {
  if (h <= 0) return "0h";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

/**
 * Chart 5 — average resolution time (hours) per week over the last 8 weeks, as a
 * single cobalt line. One series → no legend (the title names it); empty weeks
 * are bridged with `connectNulls` and the axis/tooltip render human hours.
 */
export function ChartResolutionLine({ data }: { data: ResolutionWeek[] }) {
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const isEmpty = data.every((d) => d.hours == null);

  if (isEmpty) return <ChartEmpty height={H} message="No resolved tickets in the last 8 weeks." />;
  if (!mounted) return <ChartSkeleton height={H} />;

  return (
    <div className="mt-4" style={{ height: H }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 10, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeOpacity={0.7} />
          <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis
            tick={axisTick}
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={fmtHours}
          />
          <Tooltip
            cursor={{ stroke: CHART.accent, strokeOpacity: 0.35 }}
            content={<ChartTooltip valueFormatter={fmtHours} />}
          />
          <Line
            type="monotone"
            dataKey="hours"
            name="Avg resolution"
            stroke={CHART.accent}
            strokeWidth={2}
            connectNulls
            dot={{ r: 3, fill: CHART.accent, stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: CHART.accent, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={!reduced}
            animationDuration={900}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
