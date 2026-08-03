"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared plumbing for the recharts dashboard charts. Keeps every chart on-spec
 * (design-system.md): tokens for colour, mono numerals, one card radius/shadow,
 * and reduced-motion respected. Also provides the two states every chart must
 * ship — a loading skeleton and an empty state — plus a themed tooltip so the
 * recharts default (white box, sans numbers) never leaks through.
 */

/* ------------------------------------------------------------------ *
 * Token palette — charts consume CSS variables, never raw hex.
 * ------------------------------------------------------------------ */
export const CHART = {
  accent: "var(--accent)",
  resolved: "var(--status-resolved)",
  grid: "var(--border)",
  axis: "var(--text-muted)",
  surface: "var(--surface)",
  status: {
    OPEN: "var(--status-open)",
    IN_PROGRESS: "var(--status-in-progress)",
    RESOLVED: "var(--status-resolved)",
    CLOSED: "var(--status-closed)",
  },
  priority: {
    LOW: "var(--priority-low)",
    MEDIUM: "var(--priority-medium)",
    HIGH: "var(--priority-high)",
    URGENT: "var(--priority-urgent)",
  },
  /** Sequential severity ramp for the aging buckets (fresh → stale). */
  aging: [
    "var(--status-resolved)",
    "var(--priority-medium)",
    "var(--priority-high)",
    "var(--priority-urgent)",
  ],
} as const;

/** Shared axis-tick style — foreground ink (readable, not muted gray), small; mono
 *  for the numeric axis. Axis labels are always-on, so they use the dark foreground
 *  rather than the muted token that was too light to read on the dashboard. */
export const axisTick = { fill: "var(--foreground)", fontSize: 11 } as const;
export const monoTick = {
  fill: "var(--foreground)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
} as const;

/* ------------------------------------------------------------------ *
 * Hooks
 * ------------------------------------------------------------------ */

/** True once mounted on the client — gates recharts so SSR renders the skeleton
 *  (identical on server + first client paint → no hydration mismatch), then the
 *  chart swaps in after the effect. Doubles as the per-chart loading state. */
export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Tracks the user's reduced-motion preference so charts can disable animation. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/* ------------------------------------------------------------------ *
 * States — skeleton + empty
 * ------------------------------------------------------------------ */

export function ChartSkeleton({
  height,
  className,
}: {
  height: number;
  className?: string;
}) {
  return (
    <div
      className={cn("mt-4 w-full", className)}
      style={{ height }}
      aria-hidden
    >
      <div className="flex h-full w-full items-end gap-2 rounded-[var(--radius-input)]">
        {[62, 40, 78, 33, 55, 70, 46].map((h, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t-[4px] bg-surface-muted"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function ChartEmpty({
  height,
  message = "No data in this range.",
  icon,
}: {
  height: number;
  message?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-[var(--radius-input)] border border-dashed border-border text-text-muted"
      style={{ height }}
    >
      {icon ? <div className="opacity-60">{icon}</div> : null}
      <p className="text-xs">{message}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tooltip — themed to the design tokens (surface, popover shadow, mono numbers).
 * ------------------------------------------------------------------ */

type TooltipEntry = {
  name?: string | number;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  labelFormatter?: (label: string | number) => string;
  valueFormatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-32 rounded-[var(--radius-input)] border border-border bg-surface p-2.5 shadow-[var(--shadow-popover)]">
      {label !== undefined && label !== "" ? (
        <div className="mb-1.5 text-[11px] font-semibold text-foreground">
          {labelFormatter ? labelFormatter(label) : label}
        </div>
      ) : null}
      <ul className="space-y-1">
        {payload.map((entry, i) => (
          <li
            key={i}
            className="flex items-center justify-between gap-4 text-xs"
          >
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {typeof entry.value === "number" && valueFormatter
                ? valueFormatter(entry.value)
                : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Deterministic date label — "Jul 15" from "YYYY-MM-DD". Parsed by hand (no
 * locale/timezone) so it never drifts; safe on client-only chart renders.
 * ------------------------------------------------------------------ */
const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
export function fmtMonthDay(dateStr: string): string {
  const parts = dateStr.split("-");
  if (parts.length < 3) return dateStr;
  return `${MONTHS[Number(parts[1]) - 1]} ${Number(parts[2])}`;
}

/** A small legend row (dot + label) — identity beyond colour for ≥2 series. */
export function ChartLegend({
  items,
}: {
  items: { label: string; color: string }[];
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="size-1.5 rounded-full"
            style={{ backgroundColor: it.color }}
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}
