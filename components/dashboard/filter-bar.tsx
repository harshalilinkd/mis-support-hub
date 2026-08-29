"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The facet row, collapsed behind one control on a phone.
 *
 * Every list screen stacks the same chrome before a single row of data: title,
 * description, scope + view toggles, a New button, the stage tabs, the facets, then
 * search. On a 375px screen that pushed the first card past half the viewport — you
 * scrolled to reach the thing you came for. The facets are the least-used of those
 * blocks (most visits filter nothing), so they are the ones that fold away.
 *
 * Collapsed is the default, but never silently: `activeCount` puts the number of live
 * facets on the trigger, so a filtered list can't look like an unfiltered one. From
 * `sm` up nothing changes — the facets render inline exactly as before.
 */
export function FilterBar({
  activeCount = 0,
  children,
}: {
  /** How many facets are currently narrowing the list (0 = showing everything). */
  activeCount?: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex w-full items-center justify-between gap-2 rounded-[var(--radius-input)] border border-border bg-surface px-3 py-2 text-sm font-medium transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="size-4 text-text-muted" />
          Filters
          {activeCount > 0 ? (
            <span className="rounded-full bg-accent-soft px-1.5 py-px text-[11px] font-semibold tabular-nums text-primary">
              {activeCount}
            </span>
          ) : null}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            "size-4 text-text-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        className={cn(
          "gap-2",
          // Mobile: two per row when expanded (a third column truncates the value),
          // gone when collapsed. From sm up it is the original inline row.
          open ? "grid grid-cols-2" : "hidden",
          "sm:flex sm:flex-wrap sm:items-center"
        )}
      >
        {children}
      </div>
    </>
  );
}
