"use client";

import { useCallback, useEffect, useState } from "react";

import { loadTicketDetail } from "@/lib/actions/tickets";
import type { TicketDetail as TicketDetailData } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { TicketDetail } from "@/components/tickets/ticket-detail";

/**
 * Right-side drawer that hydrates and renders the shared <TicketDetail> for a
 * ticket number (design-system.md: detail opens as a Sheet from lists).
 */
export function TicketSheet({
  number,
  currentUser,
  onOpenChange,
}: {
  number: string | null;
  currentUser: SessionUser;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<TicketDetailData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Reload the currently-open ticket (used after a mutation inside the Sheet).
  const reload = useCallback(async (n: string) => {
    const res = await loadTicketDetail(n);
    setDetail(res.ok ? res.data : null);
    setStatus(res.ok ? "ready" : "error");
  }, []);

  // Load on open / when the number changes, ignoring stale/out-of-order results.
  useEffect(() => {
    if (!number) return;
    let active = true;
    setDetail(null);
    setStatus("loading");
    void loadTicketDetail(number).then((res) => {
      if (!active) return;
      setDetail(res.ok ? res.data : null);
      setStatus(res.ok ? "ready" : "error");
    });
    return () => {
      active = false;
    };
  }, [number]);

  // Only render the detail once the loaded data matches the current number.
  const showDetail = status === "ready" && detail && detail.number === number;

  return (
    <Sheet open={!!number} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-6 sm:max-w-xl"
      >
        <SheetTitle className="sr-only">{number ?? "Ticket"}</SheetTitle>
        {showDetail ? (
          <TicketDetail
            ticket={detail}
            currentUser={currentUser}
            onMutate={() => {
              if (number) void reload(number);
            }}
          />
        ) : status === "error" ? (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-text-muted">
            Couldn&apos;t load this ticket. It may have been removed or you may not
            have access.
          </div>
        ) : (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
