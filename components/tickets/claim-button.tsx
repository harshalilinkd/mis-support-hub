"use client";

import { Hand } from "lucide-react";

import type { Status } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";
import { ClaimDialog } from "./claim-dialog";

/**
 * One-click "Claim" for a ticket row/card — opens the claim dialog (priority +
 * estimated date). Renders only when the current MIS member can claim it: the
 * ticket must be unassigned (a ticket claimed by someone else is off-limits — the
 * assignee owns it end-to-end, §6 ownership lock). Stops propagation so it never
 * also opens the row's detail Sheet.
 */
export function ClaimButton({
  ticketId,
  status,
  assigneeId,
  currentUserId,
  className,
}: {
  ticketId: string;
  status: Status;
  assigneeId: string | null;
  currentUserId: string;
  className?: string;
}) {
  const done = status === "RESOLVED" || status === "CLOSED";
  const mine = assigneeId === currentUserId;
  const working = mine && (status === "IN_PROGRESS" || status === "REOPENED");
  // Claimable only when unassigned (or already mine but not yet started).
  const canClaim = !done && !working && (!assigneeId || mine);
  if (!canClaim) return null;

  return (
    <ClaimDialog
      ticketId={ticketId}
      trigger={
        <Button
          size="sm"
          variant="outline"
          className={className}
          onClick={(e) => e.stopPropagation()}
        >
          <Hand className="size-3.5" />
          Claim
        </Button>
      }
    />
  );
}
