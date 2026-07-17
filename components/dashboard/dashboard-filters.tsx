"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

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

  function setParam(key: string, value: string) {
    const p = new URLSearchParams(params.toString());
    // Keep the URL clean: the defaults (all departments / issues) carry no param.
    if ((key === "department" && value === "all") || (key === "type" && value === "ISSUE")) {
      p.delete(key);
    } else p.set(key, value);
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
              range === r.v
                ? "bg-accent-soft text-primary"
                : "text-text-muted hover:text-foreground"
            )}
          >
            {r.l}
          </button>
        ))}
      </div>

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
