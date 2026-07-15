"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  CHART,
  ChartEmpty,
  ChartLegend,
  ChartSkeleton,
  ChartTooltip,
  axisTick,
  useMounted,
  usePrefersReducedMotion,
} from "./chart-shell";

export type PriorityWeek = {
  week: string;
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  URGENT: number;
};

const H = 240;

// Bottom → top of the stack: least → most severe.
const SERIES = [
  { key: "LOW", label: "Low", color: CHART.priority.LOW },
  { key: "MEDIUM", label: "Medium", color: CHART.priority.MEDIUM },
  { key: "HIGH", label: "High", color: CHART.priority.HIGH },
  { key: "URGENT", label: "Urgent", color: CHART.priority.URGENT },
] as const;

/**
 * Chart 4 — tickets by priority across the last 4 weeks, stacked. Reserved
 * priority colours; a thin surface stroke separates the stacked segments (the
 * 2px-gap spec, done the way a chart lib allows). Legend + tooltip name each band
 * — the Low/Medium greys are near-identical by hue, so the labels do the work.
 */
export function ChartPriorityStacked({ data }: { data: PriorityWeek[] }) {
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const isEmpty = data.every(
    (d) => d.LOW + d.MEDIUM + d.HIGH + d.URGENT === 0
  );

  if (isEmpty) return <ChartEmpty height={H} message="No triaged tickets in the last 4 weeks." />;
  if (!mounted) return <ChartSkeleton height={H} />;

  return (
    <div className="mt-4">
      <div style={{ height: H }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeOpacity={0.7} />
            <XAxis dataKey="week" tick={axisTick} tickLine={false} axisLine={false} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
            <Tooltip cursor={{ fill: "var(--surface-muted)", opacity: 0.5 }} content={<ChartTooltip />} />
            {SERIES.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="priority"
                fill={s.color}
                stroke="var(--surface)"
                strokeWidth={1}
                radius={i === SERIES.length - 1 ? [3, 3, 0, 0] : undefined}
                isAnimationActive={!reduced}
                animationDuration={800}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend items={SERIES.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  );
}
