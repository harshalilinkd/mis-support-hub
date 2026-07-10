"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Hand } from "lucide-react";
import { toast } from "sonner";

import { updateStatus } from "@/lib/actions/tickets";
import type { Status } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { ClaimDialog } from "./claim-dialog";

/**
 * MIS-only action bar on the ticket detail: one-click Claim (assign to me +
 * start work) and, once you're the assignee working on it, Mark resolved.
 * Reassignment to a specific person still lives in the dashboard Assignee menu.
 */
export function StaffTicketActions({
  ticketId,
  status,
  assignedToId,
  assignedToName,
  currentUserId,
  isAdmin,
  onMutate,
}: {
  ticketId: string;
  status: Status;
  assignedToId: string | null;
  assignedToName: string | null;
  currentUserId: string;
  isAdmin: boolean;
  onMutate?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const done = status === "RESOLVED" || status === "CLOSED";
  const mine = assignedToId === currentUserId;
  const working = mine && (status === "IN_PROGRESS" || status === "REOPENED");
  const claimedByOther = !!assignedToId && !mine;
  const canClaim = !done && !working && (!assignedToId || mine || isAdmin);

  function act(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    success: string
  ) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(success);
      onMutate?.();
      router.refresh();
    });
  }

  // Resolved/closed tickets have no staff action here (reporter confirms/reopens).
  if (done) return null;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-border bg-surface-muted/50 p-3">
      {working ? (
        <>
          <span className="text-sm text-text-muted">
            You are working on this ticket.
          </span>
          <Button
            className="ml-auto"
            size="sm"
            disabled={pending}
            onClick={() =>
              act(() => updateStatus(ticketId, "RESOLVED"), "Ticket resolved")
            }
          >
            <CheckCircle2 className="size-4" /> Mark resolved
          </Button>
        </>
      ) : claimedByOther && !isAdmin ? (
        <span className="text-sm text-text-muted">
          {assignedToName ?? "Another staff member"}{" "}
          {status === "IN_PROGRESS" || status === "REOPENED"
            ? "is working on this ticket."
            : "is assigned to this ticket."}
        </span>
      ) : canClaim ? (
        <>
          <span className="text-sm text-text-muted">
            {claimedByOther
              ? `Assigned to ${assignedToName ?? "someone"} — take it over?`
              : "Pick this up to start working on it."}
          </span>
          <ClaimDialog
            ticketId={ticketId}
            onDone={onMutate}
            trigger={
              <Button className="ml-auto" size="sm" disabled={pending}>
                <Hand className="size-4" /> Claim &amp; start
              </Button>
            }
          />
        </>
      ) : null}
    </div>
  );
}
