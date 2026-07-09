"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { reopenTicket } from "@/lib/actions/tickets";
import { Button } from "@/components/ui/button";

/**
 * Shown to the reporter (and MIS admins) when a ticket is RESOLVED.
 * "Confirm resolved" is an acknowledgement — the ticket auto-closes after 7 days
 * if not reopened (§5); the USER can't set CLOSED (§6). Reopen → reopenTicket.
 */
export function ResolutionActions({
  ticketId,
  showConfirm,
}: {
  ticketId: string;
  showConfirm: boolean;
}) {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [pending, startTransition] = useTransition();

  function reopen() {
    startTransition(async () => {
      const res = await reopenTicket(ticketId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Ticket reopened");
      router.refresh();
    });
  }

  if (confirmed) {
    return (
      <p className="rounded-[var(--radius-card)] border border-border bg-accent-soft/40 p-3 text-sm text-status-resolved">
        Thanks for confirming — this ticket will close automatically unless it is
        reopened.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-accent-soft/40 p-3">
      <span className="text-sm font-medium">Did this resolve your issue?</span>
      <div className="ml-auto flex gap-2">
        {showConfirm ? (
          <Button
            size="sm"
            onClick={() => {
              setConfirmed(true);
              toast.success("Marked as confirmed. Thanks!");
            }}
            disabled={pending}
          >
            <CheckCircle2 className="size-4" />
            Confirm resolved
          </Button>
        ) : null}
        <Button size="sm" variant="outline" onClick={reopen} disabled={pending}>
          <RotateCcw className="size-4" />
          {pending ? "Reopening…" : "Reopen"}
        </Button>
      </div>
    </div>
  );
}
