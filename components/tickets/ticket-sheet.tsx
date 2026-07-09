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
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (n: string) => {
    setLoading(true);
    const res = await loadTicketDetail(n);
    setDetail(res.ok ? res.data : null);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (number) {
      setDetail(null);
      void load(number);
    }
  }, [number, load]);

  return (
    <Sheet open={!!number} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-6 sm:max-w-xl"
      >
        <SheetTitle className="sr-only">{number ?? "Ticket"}</SheetTitle>
        {loading || !detail ? (
          <div className="space-y-4 pt-6">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : (
          <TicketDetail
            ticket={detail}
            currentUser={currentUser}
            onMutate={() => {
              if (number) void load(number);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
