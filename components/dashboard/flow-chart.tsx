"use client";

import { useRef, useState } from "react";

import type { FlowPoint } from "@/lib/db/analytics";

/**
 * FlowChart — "backlog flow": tickets created vs resolved per day.
 *
 * This is the reference implementation of the data-viz rules in
 * design-system.md §10. It deliberately embodies each one:
 *
 *  - ONE AXIS. Both series are counts, so they share a single y-scale — never a
 *    dual axis. `created` is a cobalt filled area, `resolved` a green line.
 *  - TOKEN-DRIVEN COLOR. Marks use `var(--accent)` / `var(--status-resolved)`;
 *    text uses the ink tokens (`--text-muted`). No raw hex, no series color on text.
 *  - IDENTITY BEYOND COLOR. A legend is always shown, plus a hover crosshair and a
 *    text caption, so a point is legible without relying on color alone.
 *  - RECESSIVE CHROME. Thin 2px marks, hairline gridlines at low opacity, 10px
 *    muted axis labels, ~3.5px hover markers ringed in the surface color.
 *  - ACCESSIBLE FALLBACK. A visually-hidden <table> mirrors the data for keyboard
 *    / screen-reader users (the non-pointer path), and dates are formatted
 *    deterministically (no locale) so SSR and client never disagree.
 *  - MOTION. Line-draw on mount (`flow-draw`) + area fade (`flow-fade`), both
 *    defined in globals.css and collapsing to instant under reduced-motion.
 *
 * Hand-built SVG (no chart lib) so every pixel is token-driven and the whole thing
 * scales fluidly via `viewBox` + `w-full`.
 */

// --- Geometry (SVG user units; the viewBox scales this to any width) ----------
const W = 640; // viewBox width
const H = 190; // viewBox height
const PAD = { l: 6, r: 6, t: 16, b: 30 }; // inner padding: room for top marks + x labels

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "Jun 10" from a "YYYY-MM-DD" key. Parsed by hand (not `new Date().toLocale…`)
 * so the output is identical on server and client — no locale/timezone drift and
 * therefore no hydration mismatch (design-system.md §1 · deterministic rendering).
 */
function fmtDay(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${MONTHS[Number(month) - 1]} ${Number(day)}`;
}

export function FlowChart({ data }: { data: FlowPoint[] }) {
  // The <svg> node, needed to map a mouse x back into a data index on hover.
  const ref = useRef<SVGSVGElement>(null);
  // Currently-hovered data index (null = not hovering → resting caption).
  const [hover, setHover] = useState<number | null>(null);

  // --- Scales -----------------------------------------------------------------
  // Shared y-domain across BOTH series (one axis): 0 → the largest daily count,
  // floored at 1 so a flat/empty series still has a sane, non-dividing-by-zero scale.
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => Math.max(d.created, d.resolved)));
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  // x: evenly spaced across the inner width; a single point sits centered.
  const x = (i: number) =>
    PAD.l + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  // y: value 0 at the baseline, `max` at the top (SVG y grows downward, so invert).
  const y = (v: number) => PAD.t + innerH - (v / max) * innerH;

  // --- Path building ----------------------------------------------------------
  // A polyline through every day for one series (M to the first point, L to the rest).
  const linePath = (key: "created" | "resolved") =>
    data
      .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d[key]).toFixed(1)}`)
      .join(" ");
  const createdLine = linePath("created");
  // The area is the created line closed down to the baseline and back to the start.
  const createdArea = `${createdLine} L ${x(n - 1).toFixed(1)} ${PAD.t + innerH} L ${x(0).toFixed(1)} ${PAD.t + innerH} Z`;
  const resolvedLine = linePath("resolved");

  // --- Interaction ------------------------------------------------------------
  // Map the pointer's client x into the nearest data index (accounting for the
  // viewBox → pixel scale), clamped to the valid range.
  function onMove(e: React.MouseEvent) {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / innerW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  // Only label the first / middle / last day to keep the axis uncluttered.
  const labelIdx = [0, Math.floor((n - 1) / 2), n - 1];
  const point = hover !== null ? data[hover] : null;

  return (
    <div>
      {/* Legend — always present so identity is never color-alone (§10). The dots
          are decorative (aria-hidden); the words carry the meaning. */}
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
        {/* Fill gradient: cobalt fading to transparent toward the baseline. */}
        <defs>
          <linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Gridlines — recessive: hairline, border token, low opacity, at 0/50/100%. */}
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

        {/* Created: filled area (fades in) + the 2px line on top (draws in). */}
        <path d={createdArea} fill="url(#flowFill)" className="flow-fade" />
        <path
          d={createdLine}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="flow-draw"
        />
        {/* Resolved: the green comparison line, drawn slightly after Created. */}
        <path
          d={resolvedLine}
          fill="none"
          stroke="var(--status-resolved)"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          className="flow-draw"
          style={{ animationDelay: "0.15s" }}
        />

        {/* Hover layer: a vertical crosshair + a ringed marker on each series at the
            hovered day. Markers are filled with the surface color so the stroke
            reads as a clean ring over the lines. */}
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

        {/* X axis: only first / middle / last day, anchored so end labels don't clip. */}
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

      {/* Caption: the hovered day's numbers as a sentence (values in the series
          colors, words in ink) — the text channel that makes the hover legible
          without relying on color. Fixed height so the layout doesn't jump. */}
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

      {/* Non-pointer access to the same data (keyboard / screen reader): a
          visually-hidden table mirroring the chart, so the information is never
          pointer-only (design-system.md §10 · accessible fallback). */}
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
