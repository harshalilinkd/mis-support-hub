"use client";

import { toIso } from "@/lib/format";

/**
 * Fixed locale + timeZone → the string is identical on the server and the client
 * (no hydration mismatch), and the group runs on IST so everyone sees the same
 * wall-clock time regardless of their browser's timezone.
 */
const TZ = "Asia/Kolkata";
const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ,
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const TIME_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * Absolute date + time in IST, e.g. "09 Jul 2026, 8:30 PM". Use this (instead of
 * RelativeTime) wherever the exact timestamp matters — the tickets table, the
 * ticket detail, and the activity timeline. `stacked` renders the time on a
 * second, muted line so it fits a narrow table column.
 */
export function AbsoluteTime({
  date,
  className,
  stacked = false,
}: {
  date: string | Date;
  className?: string;
  stacked?: boolean;
}) {
  const iso = toIso(date);
  const d = new Date(iso);
  // Some ICU versions emit a narrow no-break space (U+202F) before AM/PM.
  // Collapsing all whitespace to a plain space makes the output byte-identical
  // on the server and the client regardless of their ICU build — so the two
  // stacked <span>s (which suppressHydrationWarning on the parent <time> does
  // NOT cover) can never trigger a hydration mismatch.
  const norm = (s: string) => s.replace(/\s+/g, " ");
  const day = norm(DATE_FMT.format(d));
  const time = norm(TIME_FMT.format(d));

  if (stacked) {
    return (
      <time dateTime={iso} className={className} suppressHydrationWarning>
        <span className="block" suppressHydrationWarning>
          {day}
        </span>
        <span className="block opacity-75" suppressHydrationWarning>
          {time}
        </span>
      </time>
    );
  }

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {day}, {time}
    </time>
  );
}
