"use client";

import { useState } from "react";
import { Sparkles, Ticket } from "lucide-react";

import type { RequestListRow } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { MyTicketsView } from "./my-tickets-view";
import { RequestsView } from "./requests-view";
import type { TicketCardData } from "./ticket-card";

type Section = "tickets" | "systems";

/**
 * "Assigned to Me" for an MIS member: their issue queue and their system-request
 * builds are different work, so they get their own section rather than being mixed
 * into one list. Each section reuses the list that already owns it — MyTicketsView
 * (status tabs + inline controls) and RequestsView (stage tabs + request sheet) —
 * so there is no second implementation to drift.
 */
export function MyWorkView({
  tickets,
  requests,
  currentUser,
}: {
  tickets: TicketCardData[];
  requests: RequestListRow[];
  currentUser: SessionUser;
}) {
  // Land on whichever section actually has work; tickets win a tie.
  const [section, setSection] = useState<Section>(() =>
    tickets.length === 0 && requests.length > 0 ? "systems" : "tickets"
  );

  const SECTIONS: { key: Section; label: string; icon: typeof Ticket; count: number }[] = [
    { key: "tickets", label: "Tickets", icon: Ticket, count: tickets.length },
    { key: "systems", label: "Systems", icon: Sparkles, count: requests.length },
  ];

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-[var(--radius-input)] border border-border bg-surface p-0.5">
        {SECTIONS.map((s) => {
          const active = section === s.key;
          const Icon = s.icon;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={active}
              onClick={() => setSection(s.key)}
              className={cn(
                "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "bg-accent-soft text-primary" : "text-foreground hover:bg-surface-muted"
              )}
            >
              <Icon className="size-4" />
              {s.label}
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                  active ? "bg-primary/15 text-primary" : "bg-surface-muted text-text-muted"
                )}
              >
                {s.count}
              </span>
            </button>
          );
        })}
      </div>

      {section === "tickets" ? (
        <MyTicketsView tickets={tickets} variant="assigned" currentUser={currentUser} />
      ) : (
        <RequestsView requests={requests} currentUser={currentUser} />
      )}
    </div>
  );
}
