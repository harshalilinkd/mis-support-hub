"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts a number up from 0 on mount (easeOutCubic). Respects reduced-motion
 * (jumps straight to the value) and formats with locale grouping. Used for the
 * dashboard KPI figures so the numbers feel alive without any layout shift.
 */
export function CountUp({
  value,
  duration = 900,
  className,
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(0);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) {
      setDisplay(value);
      return;
    }
    ranRef.current = true;

    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce || value === 0) {
      setDisplay(value);
      return;
    }

    setDisplay(0);
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(eased * value));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className={className}>{display.toLocaleString()}</span>;
}
