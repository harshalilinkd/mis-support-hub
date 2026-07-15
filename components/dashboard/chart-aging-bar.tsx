"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
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

export type AgingDatum = { name: string; value: number; color: string };

const H = 240;

/**
 * Chart 6 — open-ticket aging buckets (0–1d, 1–3d, 3–7d, 7d+) as columns on a
 * sequential fresh→stale severity ramp, so a tall bar on the right reads as an
 * SLA problem at a glance.
 */
export function ChartAgingBar({ data }: { data: AgingDatum[] }) {
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const isEmpty = data.every((d) => d.value === 0);

  if (isEmpty) return <ChartEmpty height={H} message="No open tickets right now." />;
  if (!mounted) return <ChartSkeleton height={H} />;

  return (
    <div className="mt-4" style={{ height: H }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 6, left: -18, bottom: 0 }} barCategoryGap="26%">
          <CartesianGrid vertical={false} stroke={CHART.grid} strokeOpacity={0.7} />
          <XAxis dataKey="name" tick={axisTick} tickLine={false} axisLine={false} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--surface-muted)", opacity: 0.5 }} content={<ChartTooltip />} />
          <Bar dataKey="value" name="Open tickets" radius={[4, 4, 0, 0]} maxBarSize={64} isAnimationActive={!reduced} animationDuration={800}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.color} />
            ))}
            <LabelList
              dataKey="value"
              position="top"
              style={{ fill: "var(--foreground)", fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
