"use client";

import {
  Bar,
  BarChart,
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
  useMounted,
  usePrefersReducedMotion,
} from "./chart-shell";

export type DeptDatum = { name: string; value: number };

const H = 240;

/**
 * Chart 3 — tickets by department, horizontal bars. Magnitude comparison, so a
 * single cobalt hue (height/length carries the value); the leader stays at full
 * strength and the rest dim slightly so the busiest department reads first.
 */
export function ChartDepartmentBar({ data }: { data: DeptDatum[] }) {
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const max = Math.max(0, ...data.map((d) => d.value));
  const isEmpty = max === 0;

  if (isEmpty) return <ChartEmpty height={H} message="No tickets in this range." />;
  if (!mounted) return <ChartSkeleton height={H} />;

  return (
    <div className="mt-4" style={{ height: H }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 34, left: 4, bottom: 4 }}
          barCategoryGap={14}
        >
          <XAxis type="number" hide domain={[0, max * 1.15 || 1]} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "var(--foreground)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={104}
          />
          <Tooltip cursor={{ fill: "var(--surface-muted)", opacity: 0.5 }} content={<ChartTooltip />} />
          <Bar dataKey="value" name="Tickets" radius={[0, 4, 4, 0]} isAnimationActive={!reduced} animationDuration={800}>
            {data.map((d) => (
              <Cell
                key={d.name}
                fill={CHART.accent}
                fillOpacity={d.value === max ? 1 : 0.55}
              />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              style={{ fill: "var(--foreground)", fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 500 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
