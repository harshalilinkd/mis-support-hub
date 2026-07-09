"use client";

import { useRef, useState } from "react";

import type { TrendPoint } from "@/lib/db/queries";

const W = 640;
const H = 180;
const PAD = { l: 6, r: 6, t: 14, b: 22 };

function fmtDay(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Single-series area chart of tickets created per day (change-over-time).
 * Cobalt line + gradient fill, recessive grid, crosshair + caption on hover.
 * One series → no legend (the card title names it).
 */
export function TicketTrendChart({ data }: { data: TrendPoint[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.created));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) =>
    PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.t + innerH - (v / max) * innerH;

  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.created).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(n - 1).toFixed(1)} ${PAD.t + innerH} L ${x(0).toFixed(1)} ${PAD.t + innerH} Z`;

  function onMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Tickets created per day over the last 30 days"
      >
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((f) => (
          <line
            key={f}
            x1={PAD.l}
            x2={W - PAD.r}
            y1={PAD.t + innerH * f}
            y2={PAD.t + innerH * f}
            stroke="var(--border)"
            strokeWidth="1"
            opacity="0.7"
          />
        ))}

        <path d={area} fill="url(#trendFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {hover !== null ? (
          <>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={PAD.t}
              y2={PAD.t + innerH}
              stroke="var(--accent)"
              strokeWidth="1"
              opacity="0.45"
            />
            <circle
              cx={x(hover)}
              cy={y(data[hover].created)}
              r="4"
              fill="var(--surface)"
              stroke="var(--accent)"
              strokeWidth="2"
            />
          </>
        ) : null}

        {labelIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            className="fill-[var(--text-muted)] text-[10px]"
          >
            {fmtDay(data[i].date)}
          </text>
        ))}
      </svg>

      <div className="mt-1 h-4 text-xs text-text-muted">
        {hover !== null ? (
          <>
            <span className="font-semibold text-foreground">
              {data[hover].created}
            </span>{" "}
            created on {fmtDay(data[hover].date)}
          </>
        ) : (
          "Hover for daily detail"
        )}
      </div>
    </div>
  );
}
