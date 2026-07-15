"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import {
  ChartEmpty,
  ChartSkeleton,
  ChartTooltip,
  useMounted,
  usePrefersReducedMotion,
} from "./chart-shell";

export type StatusDatum = { name: string; key: string; value: number; color: string };

const H = 240;

/**
 * Chart 2 — open tickets by status (OPEN / IN_PROGRESS / RESOLVED) as a donut.
 * Reserved status colours; a 2px surface gap between slices; the total sits in
 * the hole and a dot+label+value legend gives identity beyond colour (the
 * amber/green pair is low-contrast on the surface, so the legend does the work).
 */
export function ChartStatusDonut({ data }: { data: StatusDatum[] }) {
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const slices = data.filter((d) => d.value > 0);

  if (total === 0) return <ChartEmpty height={H} message="No open tickets right now." />;
  if (!mounted) return <ChartSkeleton height={H} />;

  return (
    <div className="mt-4">
      <div className="relative" style={{ height: H }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={92}
              paddingAngle={slices.length > 1 ? 2 : 0}
              startAngle={90}
              endAngle={-270}
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={!reduced}
              animationDuration={800}
            >
              {slices.map((s) => (
                <Cell key={s.key} fill={s.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Total in the hole — mono, proportional-figure size. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold leading-none tabular-nums">
            {total}
          </span>
          <span className="mt-1 text-[11px] uppercase tracking-wider text-text-muted">
            open
          </span>
        </div>
      </div>
      {/* Legend — the dependable identity channel. */}
      <ul className="mt-3 space-y-0.5">
        {data.map((d) => (
          <li
            key={d.key}
            className="flex items-center justify-between gap-2 px-1 text-xs"
          >
            <span className="inline-flex min-w-0 items-center gap-2">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="truncate text-text-muted">{d.name}</span>
            </span>
            <span className="font-mono font-medium tabular-nums">
              {d.value}
              <span className="ml-1.5 text-text-muted">
                {total ? Math.round((d.value / total) * 100) : 0}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
