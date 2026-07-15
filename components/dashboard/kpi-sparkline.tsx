"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";

import { useMounted, usePrefersReducedMotion } from "./chart-shell";

/**
 * A tiny area sparkline for the KPI cards — no axes, no tooltip, just the shape
 * of the card's metric over the recent window. Tinted with the card's own accent
 * token. Mounted-gated (recharts is client-only) so SSR/first paint reserve the
 * strip's height without a hydration mismatch; reduced-motion disables the draw.
 */
export function KpiSparkline({
  data,
  color,
  height = 34,
}: {
  data: number[];
  color: string;
  height?: number;
}) {
  const mounted = useMounted();
  const reduced = usePrefersReducedMotion();
  const gid = useId().replace(/:/g, "");

  // Reserve the strip on the server + first client render (keeps card height stable).
  if (!mounted || data.length < 2) {
    return <div style={{ height }} aria-hidden />;
  }

  const points = data.map((v, i) => ({ i, v }));

  return (
    <div style={{ height }} aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.75}
            fill={`url(#spark-${gid})`}
            dot={false}
            isAnimationActive={!reduced}
            animationDuration={700}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
