"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The status/stage tab row, made honest on a narrow screen.
 *
 * These rows carry 5–9 pills with count badges, which cannot fit a phone. They have
 * always scrolled horizontally, but with the scrollbar hidden there was NOTHING saying
 * so: the last tab was sliced mid-word ("Claime…") and read as a broken layout rather
 * than as "there is more this way". Wrapping instead was the alternative and it costs
 * three stacked rows of pills above every list — too much of a short screen.
 *
 * So: keep the scroll, and show a soft edge fade on whichever side has more content.
 * The fades are measured (not always-on) so a row that fits shows none, and they are
 * pointer-events-none, so they never eat a tap on the tab beneath.
 */
export function TabScroller({
  children,
  className,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      // 1px slack: sub-pixel widths otherwise leave a permanent phantom fade.
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Re-measure when the row itself resizes (rotation, a count badge widening) —
    // ResizeObserver rather than a window listener, which misses both.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={ref}
        aria-label={ariaLabel}
        className="flex w-full overflow-x-auto rounded-[var(--radius-input)] border border-border bg-surface p-0.5 [scrollbar-width:none] sm:w-auto [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {edges.left ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 left-0.5 w-6 rounded-l-[var(--radius-input)] bg-gradient-to-r from-surface to-transparent"
        />
      ) : null}
      {edges.right ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0.5 right-0.5 w-6 rounded-r-[var(--radius-input)] bg-gradient-to-l from-surface to-transparent"
        />
      ) : null}
    </div>
  );
}
