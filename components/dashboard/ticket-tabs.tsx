"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  TICKET_TABS,
  ticketTabFromParam,
  type TicketTabKey,
} from "@/lib/ticket-tabs";
import { cn } from "@/lib/utils";

/**
 * Status sub-tabs for the All Tickets view (All / Active / Resolved). Reflects
 * into the URL (`?tab=`) like the toolbar facets, so views stay shareable and the
 * server does the filtering. Other query params (search, dept, …) are preserved.
 */
export function TicketTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = ticketTabFromParam(searchParams.get("tab") ?? undefined);

  function select(key: TicketTabKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "all") params.delete("tab");
    else params.set("tab", key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div
      aria-label="Filter tickets by status"
      className="inline-flex rounded-[var(--radius-input)] border border-border bg-surface p-0.5"
    >
      {TICKET_TABS.map((t) => {
        const active = current === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={active}
            onClick={() => select(t.key)}
            className={cn(
              "rounded-[6px] px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent-soft text-primary"
                : "text-text-muted hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
