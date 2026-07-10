"use client";

import { useEffect, useState } from "react";

export type BarItem = { id?: string; label: string; value: number; color?: string };

/**
 * Horizontal labeled bars (dot + label + value + track). Magnitude comparison:
 * a single cobalt hue by default; pass `color` per item for reserved status /
 * priority / severity colors. Bars grow in on mount (staggered) and each row
 * highlights on hover; both collapse to instant under reduced-motion.
 */
export function BarList({
  items,
  totalLabel,
  emptyLabel = "No data in this range.",
}: {
  items: BarItem[];
  // A precomputed string, not a function — functions can't cross the Server →
  // Client Component boundary (BarList is a client component for the animation).
  totalLabel?: string;
  emptyLabel?: string;
}) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  const max = Math.max(1, ...items.map((i) => i.value));

  // Grow bars from 0 → target after the first paint (CSS transition does the work).
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(r);
  }, []);

  if (total === 0) {
    return <p className="mt-4 text-xs text-text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="mt-4 space-y-1">
      {items.map((i, idx) => (
        <div
          key={i.id ?? i.label}
          className="group -mx-2 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted/60"
        >
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="inline-flex min-w-0 items-center gap-1.5 text-text-muted">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full transition-transform duration-200 group-hover:scale-150"
                style={{ backgroundColor: i.color ?? "var(--accent)" }}
              />
              <span className="truncate transition-colors group-hover:text-foreground">
                {i.label}
              </span>
            </span>
            <span className="font-mono font-medium tabular-nums">{i.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{
                width: grown ? `${(i.value / max) * 100}%` : "0%",
                backgroundColor: i.color ?? "var(--accent)",
                transitionDelay: `${idx * 70}ms`,
              }}
            />
          </div>
        </div>
      ))}
      {totalLabel ? (
        <div className="px-2 pt-1 text-xs text-text-muted">{totalLabel}</div>
      ) : null}
    </div>
  );
}
