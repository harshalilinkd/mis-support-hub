"use client";

import { useState } from "react";
import { Sparkles, Ticket } from "lucide-react";

import type { RequestListRow } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import type { TicketTabKey } from "@/lib/ticket-tabs";
import { cn } from "@/lib/utils";
import { MyTicketsView } from "./my-tickets-view";
import { RequestsView } from "./requests-view";
import type { TicketCardData } from "./ticket-card";

type Section = "tickets" | "systems";

/**
 * The combined "my involvement" view — issues and system requests are different work,
 * so they get their own sub-tab rather than being mixed into one list. Each sub-tab
 * reuses the list that already owns it — MyTicketsView (status tabs + inline controls)
 * and RequestsView (stage tabs + request sheet) — so there is no second implementation
 * to drift.
 *
 * Used for BOTH audiences, differing only by `variant` (which the ticket sub-view uses
 * to decide raised-vs-assigned columns/controls):
 *  • staff ("Assigned to Me") → issues assigned to them + requests they're building.
 *  • USER  ("My Tickets")     → issues they raised + requests they submitted. Employees
 *    used to lose their requests entirely because /my listed only issues; this is the
 *    surface that fixes that.
 */
export function MyWorkView({
  tickets,
  requests,
  currentUser,
  variant = "assigned",
  initialSection,
  initialTab,
}: {
  tickets: TicketCardData[];
  requests: RequestListRow[];
  currentUser: SessionUser;
  variant?: "raised" | "assigned";
  /** Deep-link from a dashboard KPI: which sub-tab + which status to open on. */
  initialSection?: Section;
  initialTab?: TicketTabKey;
}) {
  // A deep-linked section wins; otherwise land on whichever has work (tickets win a tie).
  const [section, setSection] = useState<Section>(
    () =>
      initialSection ??
      (tickets.length === 0 && requests.length > 0 ? "systems" : "tickets")
  );

  const SECTIONS: { key: Section; label: string; icon: typeof Ticket; count: number }[] = [
    { key: "tickets", label: "Issues", icon: Ticket, count: tickets.length },
    { key: "systems", label: "System Requests", icon: Sparkles, count: requests.length },
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
        <MyTicketsView
          tickets={tickets}
          variant={variant}
          currentUser={currentUser}
          initialTab={initialTab}
        />
      ) : (
        <RequestsView requests={requests} currentUser={currentUser} />
      )}
    </div>
  );
}
