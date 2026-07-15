"use client";

import {
  Area,
  AreaChart,
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
  fmtMonthDay,
  useMounted,
  usePrefersReducedMotion,
} from "./chart-shell";

export type FlowDatum = { date: string; created: number; resolved: number };

const H = 240;

/**
 * Chart 1 — Created vs Resolved over the last 30 days (two series, one shared
 * count axis). Cobalt "created" area over a green "resolved" area; the legend +
 * themed tooltip carry identity beyond colour.
 */
export function ChartCreatedResolved({ data }: { data: FlowDatum[] }) {
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const isEmpty = data.every((d) => d.created === 0 && d.resolved === 0);

  if (isEmpty) return <ChartEmpty height={H} message="No tickets created or resolved in the last 30 days." />;
  if (!mounted) return <ChartSkeleton height={H} />;

  return (
    <div className="mt-4">
      <div style={{ height: H }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.accent} stopOpacity={0.22} />
                <stop offset="100%" stopColor={CHART.accent} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="fillResolved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={CHART.resolved} stopOpacity={0.16} />
                <stop offset="100%" stopColor={CHART.resolved} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={CHART.grid} strokeOpacity={0.7} />
            <XAxis
              dataKey="date"
              tickFormatter={fmtMonthDay}
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              minTickGap={44}
            />
            <YAxis
              tick={axisTick}
              tickLine={false}
              axisLine={false}
              width={40}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: CHART.accent, strokeOpacity: 0.35 }}
              content={<ChartTooltip labelFormatter={(l) => fmtMonthDay(String(l))} />}
            />
            <Area
              type="monotone"
              dataKey="resolved"
              name="Resolved"
              stroke={CHART.resolved}
              strokeWidth={2}
              fill="url(#fillResolved)"
              isAnimationActive={!reduced}
              animationDuration={900}
            />
            <Area
              type="monotone"
              dataKey="created"
              name="Created"
              stroke={CHART.accent}
              strokeWidth={2}
              fill="url(#fillCreated)"
              isAnimationActive={!reduced}
              animationDuration={900}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <ChartLegend
        items={[
          { label: "Created", color: CHART.accent },
          { label: "Resolved", color: CHART.resolved },
        ]}
      />
    </div>
  );
}
