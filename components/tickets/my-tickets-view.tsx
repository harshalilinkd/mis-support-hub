"use client";

import { useMemo, useState } from "react";
import { Inbox, Search } from "lucide-react";

import { EmptyState } from "@/components/shell/empty-state";
import { Input } from "@/components/ui/input";
import { ACTIVE_STATUSES } from "@/lib/ticket-state";
import { cn } from "@/lib/utils";
import { TicketCard, type TicketCardData } from "./ticket-card";

const TABS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "resolved", label: "Resolved" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function MyTicketsView({ tickets }: { tickets: TicketCardData[] }) {
  const [tab, setTab] = useState<TabKey>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      const matchTab =
        tab === "all"
          ? true
          : tab === "active"
            ? ACTIVE_STATUSES.includes(t.status)
            : t.status === "RESOLVED" || t.status === "CLOSED";
      const matchQuery =
        !q ||
        t.title.toLowerCase().includes(q) ||
        t.number.toLowerCase().includes(q);
      return matchTab && matchQuery;
    });
  }, [tickets, tab, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-[var(--radius-input)] border border-border bg-surface p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-[6px] px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.key
                  ? "bg-accent-soft text-primary"
                  : "text-text-muted hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search my tickets…"
            className="pl-9"
            aria-label="Search my tickets"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        tickets.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="No tickets yet"
            description="Raise a ticket for any system, sheet, or app issue and the MIS team will pick it up."
            actionHref="/new"
            actionLabel="Raise a ticket"
          />
        ) : (
          <EmptyState
            icon={<Search className="size-5" />}
            title="No matching tickets"
            description="Try a different search term or filter."
          />
        )
      ) : (
        <div className="grid gap-3">
          {filtered.map((t, i) => (
            <TicketCard
              key={t.number}
              ticket={t}
              style={{
                animationDelay: `${Math.min(i, 12) * 40}ms`,
                animationFillMode: "backwards",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
