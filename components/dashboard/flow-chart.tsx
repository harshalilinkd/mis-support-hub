"use client";

import { useRef, useState } from "react";

import type { FlowPoint } from "@/lib/db/analytics";

const W = 640;
const H = 190;
const PAD = { l: 6, r: 6, t: 16, b: 30 };

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Deterministic "Jun 10" from a "YYYY-MM-DD" key (no locale → no hydration mismatch). */
function fmtDay(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

/**
 * Created vs resolved per day — the backlog-flow chart. Two series, one axis
 * (both are counts): created is a cobalt filled area, resolved a green line.
 * Legend + hover caption so identity is never colour-alone (design-system.md).
 */
export function FlowChart({ data }: { data: FlowPoint[] }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const n = data.length;
  const max = Math.max(1, ...data.map((d) => Math.max(d.created, d.resolved)));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const x = (i: number) =>
    PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.t + innerH - (v / max) * innerH;

  const linePath = (key: "created" | "resolved") =>
    data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`)
      .join(" ");
  const createdLine = linePath("created");
  const createdArea = `${createdLine} L ${x(n - 1).toFixed(1)} ${PAD.t + innerH} L ${x(0).toFixed(1)} ${PAD.t + innerH} Z`;
  const resolvedLine = linePath("resolved");

  function onMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1];
  const point = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: "var(--accent)" }}
          />
          Created
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: "var(--status-resolved)" }}
          />
          Resolved
        </span>
      </div>

      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Tickets created versus resolved per day"
      >
        <defs>
          <linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
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

        <path d={createdArea} fill="url(#flowFill)" />
        <path
          d={createdLine}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          d={resolvedLine}
          fill="none"
          stroke="var(--status-resolved)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {point ? (
          <>
            <line
              x1={x(hover!)}
              x2={x(hover!)}
              y1={PAD.t}
              y2={PAD.t + innerH}
              stroke="var(--accent)"
              strokeWidth="1"
              opacity="0.4"
            />
            <circle cx={x(hover!)} cy={y(point.created)} r="3.5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2" />
            <circle cx={x(hover!)} cy={y(point.resolved)} r="3.5" fill="var(--surface)" stroke="var(--status-resolved)" strokeWidth="2" />
          </>
        ) : null}

        {labelIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 10}
            textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
            className="fill-[var(--text-muted)] text-[10px]"
          >
            {data[i] ? fmtDay(data[i].date) : ""}
          </text>
        ))}
      </svg>

      <div className="mt-1 h-4 text-xs text-text-muted">
        {point ? (
          <>
            <span className="font-medium text-primary">{point.created}</span> created ·{" "}
            <span className="font-medium" style={{ color: "var(--status-resolved)" }}>
              {point.resolved}
            </span>{" "}
            resolved on {fmtDay(point.date)}
          </>
        ) : (
          "Hover for daily detail"
        )}
      </div>

      {/* Non-pointer access to the same data (keyboard / screen reader). */}
      <table className="sr-only">
        <caption>Tickets created versus resolved per day</caption>
        <thead>
          <tr>
            <th>Date</th>
            <th>Created</th>
            <th>Resolved</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{fmtDay(d.date)}</td>
              <td>{d.created}</td>
              <td>{d.resolved}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
