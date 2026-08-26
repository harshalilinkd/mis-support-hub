/** Normalize a Date or ISO string to an ISO string (safe across drizzle modes). */
export function toIso(value: Date | string): string {
  return typeof value === "string" ? value : new Date(value).toISOString();
}

// Hoisted to module scope — Intl constructors are expensive (locale resolution)
// and this ran on every formatRelative call (per notification, per 60s tick).
const RELATIVE_FMT = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

/** "just now", "2h ago", "3 days ago" (CLAUDE.md §9 — relative time in lists). */
export function formatRelative(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const sign = diffMs < 0 ? -1 : 1;
  const sec = Math.round(Math.abs(diffMs) / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);

  if (sec < 45) return "just now";
  if (min < 60) return RELATIVE_FMT.format(sign * min, "minute");
  if (hr < 24) return RELATIVE_FMT.format(sign * hr, "hour");
  if (day < 30) return RELATIVE_FMT.format(sign * day, "day");
  const month = Math.round(day / 30);
  if (month < 12) return RELATIVE_FMT.format(sign * month, "month");
  return RELATIVE_FMT.format(sign * Math.round(month / 12), "year");
}

/** Absolute, locale-formatted date-time (for tooltips). */
/**
 * Is this sheet/system value an actual link? The field accepts EITHER a URL or a
 * plain system name (CLAUDE.md §1), so anything non-http(s) must render as text —
 * never as an anchor. Shared by the issue "Link / Files" cell and the request
 * detail so there is one rule, not two.
 */
export const isUrl = (v: string) => /^https?:\/\//i.test(v);

export function formatDateTime(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * A ticket deadline (due date) as a plain IST calendar date, e.g. "13 Jul 2026".
 * Fixed timezone → deterministic on server and client (no hydration mismatch).
 * Returns null when there is no deadline yet (not claimed).
 */
const DUE_DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
export function formatDueDate(
  value: Date | string | null | undefined
): string | null {
  if (!value) return null;
  const d = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(d.getTime()) ? null : DUE_DATE_FMT.format(d);
}

/* ------------------------------------------------------------------ *
 * IST calendar days (CLAUDE.md §9 — stored UTC, read in a fixed IST timezone).
 *
 * A `<input type="date">` speaks "YYYY-MM-DD" — a calendar DAY with no time and no
 * zone. Turning that into an instant (and back) has to pick a timezone, and the app's
 * is IST, so both directions live here rather than being re-derived per caller. IST is
 * a fixed +05:30 with no DST, so this is arithmetic, not a lookup.
 * ------------------------------------------------------------------ */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The IST calendar day an instant falls on, as "YYYY-MM-DD" (an <input> value). */
export function istDayKey(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * The LAST instant of an IST calendar day ("2026-08-13" → 13 Aug 23:59:59.999 IST).
 * End-of-day, not midnight, so a resolution backdated to the day the ticket was raised
 * still lands after it was created — midnight would land before it and make
 * "resolved − created" negative in the dashboard's averages.
 * Returns null on a malformed or impossible date ("2026-02-31").
 */
export function istDayEnd(dayKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const ms = Date.parse(`${dayKey}T23:59:59.999+05:30`);
  if (Number.isNaN(ms)) return null;
  const at = new Date(ms);
  // Round-trip guard: Date.parse SILENTLY ROLLS OVER an out-of-range day in the
  // offset form ("2026-02-31…" → 3 Mar), so a nonexistent date would sail through as
  // a different one. Only accept it if it maps back to the day asked for.
  return istDayKey(at) === dayKey ? at : null;
}

/**
 * The FIRST instant of an IST calendar day ("2026-08-24" → 24 Aug 00:00:00.000 IST).
 * The mirror of istDayEnd, and the right end for a START date: a day's work began
 * somewhere inside it, so the earliest moment is the safe bound — paired with
 * istDayEnd for completions it yields the widest, never-negative duration.
 * Returns null on a malformed or impossible date, with the same round-trip guard.
 */
export function istDayStart(dayKey: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return null;
  const ms = Date.parse(`${dayKey}T00:00:00.000+05:30`);
  if (Number.isNaN(ms)) return null;
  const at = new Date(ms);
  return istDayKey(at) === dayKey ? at : null;
}

/** "IN_PROGRESS" → "In progress"; passes through non-enum strings (names). */
export function humanizeEnum(value: string | null): string {
  if (!value) return "";
  return /^[A-Z_]+$/.test(value)
    ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ")
    : value;
}
