"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, X } from "lucide-react";

import { DEPARTMENT_LABELS, DEPARTMENTS } from "@/lib/validators/ticket";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGES = [
  { v: "7", l: "7d" },
  { v: "30", l: "30d" },
  { v: "90", l: "90d" },
];

// Which pipeline the dashboard is reporting on (§12) — issues or system requests.
const TYPES = [
  { v: "ISSUE", l: "Issues" },
  { v: "REQUEST", l: "Requests" },
];

/** Type (issues/requests) + time-range + department filter, via URL params. */
export function DashboardFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rawRange = params.get("range");
  const range = rawRange === "7" || rawRange === "90" ? rawRange : "30";
  const type = params.get("type") === "REQUEST" ? "REQUEST" : "ISSUE";
  const rawDept = params.get("department") ?? "";
  const department = (DEPARTMENTS as readonly string[]).includes(rawDept)
    ? rawDept
    : "all";

  // Custom from–to date range (the calendar pickers). Active only when BOTH are set.
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const customActive = !!(from && to);

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    // Keep the URL clean: the defaults (all departments / issues) carry no param.
    if ((key === "department" && value === "all") || (key === "type" && value === "ISSUE")) {
      p.delete(key);
    } else p.set(key, value);
    // Picking a preset overrides the custom range — clear the from/to.
    if (key === "range") {
      p.delete("from");
      p.delete("to");
    }
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function setDates(nextFrom: string, nextTo: string) {
    const p = new URLSearchParams(params.toString());
    if (nextFrom) p.set("from", nextFrom);
    else p.delete("from");
    if (nextTo) p.set("to", nextTo);
    else p.delete("to");
    // A complete custom range supersedes the preset.
    if (nextFrom && nextTo) p.delete("range");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-initial">
      {/* Which pipeline: issues or system requests (§12). */}
      <div className="inline-flex shrink-0 rounded-[var(--radius-input)] border border-border bg-surface p-0.5">
        {TYPES.map((t) => (
          <button
            key={t.v}
            type="button"
            aria-pressed={type === t.v}
            onClick={() => setParam("type", t.v)}
            className={cn(
              "rounded-[6px] px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              type === t.v
                ? "bg-accent-soft text-primary"
                : "text-text-muted hover:text-foreground"
            )}
          >
            {t.l}
          </button>
        ))}
      </div>

      <div className="inline-flex shrink-0 rounded-[var(--radius-input)] border border-border bg-surface p-0.5">
        {RANGES.map((r) => (
          <button
            key={r.v}
            type="button"
            onClick={() => setParam("range", r.v)}
            className={cn(
              "rounded-[6px] px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !customActive && range === r.v
                ? "bg-accent-soft text-primary"
                : "text-text-muted hover:text-foreground"
            )}
          >
            {r.l}
          </button>
        ))}
      </div>

      {/* Custom from–to date range. Drives the time-based charts (Created vs resolved,
          By department) on the ISSUE view; on the request view those charts aren't
          date-windowed, so it's hidden there to avoid a no-op control. Desktop only. */}
      {type === "ISSUE" ? (
        <div
          className={cn(
            "hidden shrink-0 items-center gap-1 rounded-[var(--radius-input)] border bg-surface px-2 py-1 lg:inline-flex",
            customActive ? "border-primary/40" : "border-border"
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-text-muted" />
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setDates(e.target.value, to)}
            aria-label="From date"
            className="w-[108px] bg-transparent text-sm text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
          <span className="text-text-muted">–</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setDates(from, e.target.value)}
            aria-label="To date"
            className="w-[108px] bg-transparent text-sm text-foreground outline-none [color-scheme:light] dark:[color-scheme:dark]"
          />
          {customActive ? (
            <button
              type="button"
              onClick={() => setDates("", "")}
              aria-label="Clear date range"
              className="rounded p-0.5 text-text-muted transition-colors hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      <Select
        value={department}
        onValueChange={(v) => setParam("department", v)}
      >
        <SelectTrigger className="h-9 min-w-0 flex-1 sm:w-[168px] sm:flex-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All departments</SelectItem>
          {DEPARTMENTS.map((d) => (
            <SelectItem key={d} value={d}>
              {DEPARTMENT_LABELS[d]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
