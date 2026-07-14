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

// Hoisted (was rebuilt every render, called 2×/component). Collapses whitespace
// so the SSR + client output is byte-identical (see the note in AbsoluteTime).
const WS = /\s+/g;
const normalizeWs = (s: string) => s.replace(WS, " ");

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
  dateOnly = false,
}: {
  date: string | Date;
  className?: string;
  stacked?: boolean;
  /** Render just the date (no time) — for compact mobile cards. */
  dateOnly?: boolean;
}) {
  const iso = toIso(date);
  const d = new Date(iso);
  // Some ICU versions emit a narrow no-break space (U+202F) before AM/PM.
  // Collapsing all whitespace to a plain space makes the output byte-identical
  // on the server and the client regardless of their ICU build — so the two
  // stacked <span>s (which suppressHydrationWarning on the parent <time> does
  // NOT cover) can never trigger a hydration mismatch.
  const day = normalizeWs(DATE_FMT.format(d));
  const time = normalizeWs(TIME_FMT.format(d));

  if (dateOnly) {
    return (
      <time dateTime={iso} className={className} suppressHydrationWarning>
        {day}
      </time>
    );
  }

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
