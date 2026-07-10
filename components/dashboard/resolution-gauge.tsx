"use client";

import { useEffect, useState } from "react";

import { CountUp } from "./count-up";

/**
 * Radial "resolution rate" gauge — resolved + closed as a share of all tickets.
 * The ring sweeps in and the percentage counts up on mount (both collapse to
 * instant under reduced-motion). A non-bar visual to balance the dashboard.
 */
export function ResolutionGauge({
  done,
  total,
}: {
  done: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const r = requestAnimationFrame(() =>
      setProgress(total > 0 ? done / total : 0)
    );
    return () => cancelAnimationFrame(r);
  }, [done, total]);

  if (total === 0) {
    return <p className="mt-4 text-xs text-text-muted">No tickets yet.</p>;
  }

  const R = 54;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - progress);

  return (
    <div className="mt-4 flex flex-col items-center">
      <div className="relative size-[148px]">
        <svg viewBox="0 0 140 140" className="size-full -rotate-90">
          <circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke="var(--surface-muted)"
            strokeWidth="12"
          />
          <circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke="var(--status-resolved)"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="flex items-baseline font-mono font-semibold tabular-nums">
            <CountUp value={pct} className="text-4xl" />
            <span className="text-xl text-text-muted">%</span>
          </div>
          <span className="text-[11px] uppercase tracking-wider text-text-muted">
            resolved
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-text-muted">
        <span className="font-medium text-foreground">{done}</span> of {total}{" "}
        tickets resolved
      </p>
    </div>
  );
}
