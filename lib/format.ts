/** Normalize a Date or ISO string to an ISO string (safe across drizzle modes). */
export function toIso(value: Date | string): string {
  return typeof value === "string" ? value : new Date(value).toISOString();
}

/** "just now", "2h ago", "3 days ago" (CLAUDE.md §9 — relative time in lists). */
export function formatRelative(value: Date | string): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = date.getTime() - Date.now();
  const sign = diffMs < 0 ? -1 : 1;
  const sec = Math.round(Math.abs(diffMs) / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  if (sec < 45) return "just now";
  if (min < 60) return rtf.format(sign * min, "minute");
  if (hr < 24) return rtf.format(sign * hr, "hour");
  if (day < 30) return rtf.format(sign * day, "day");
  const month = Math.round(day / 30);
  if (month < 12) return rtf.format(sign * month, "month");
  return rtf.format(sign * Math.round(month / 12), "year");
}

/** Absolute, locale-formatted date-time (for tooltips). */
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

/** "IN_PROGRESS" → "In progress"; passes through non-enum strings (names). */
export function humanizeEnum(value: string | null): string {
  if (!value) return "";
  return /^[A-Z_]+$/.test(value)
    ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ")
    : value;
}
