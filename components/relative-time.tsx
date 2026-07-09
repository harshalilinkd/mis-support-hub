"use client";

import { useEffect, useState } from "react";

import { formatDateTime, formatRelative, toIso } from "@/lib/format";

/** Relative timestamp that refreshes every minute. Client-only to avoid drift. */
export function RelativeTime({
  date,
  className,
}: {
  date: string | Date;
  className?: string;
}) {
  const iso = toIso(date);
  const [label, setLabel] = useState(() => formatRelative(iso));

  useEffect(() => {
    setLabel(formatRelative(iso));
    const timer = setInterval(() => setLabel(formatRelative(iso)), 60_000);
    return () => clearInterval(timer);
  }, [iso]);

  return (
    <time
      dateTime={iso}
      title={formatDateTime(iso)}
      className={className}
      suppressHydrationWarning
    >
      {label}
    </time>
  );
}
