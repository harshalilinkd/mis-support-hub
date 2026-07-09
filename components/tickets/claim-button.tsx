"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hand } from "lucide-react";
import { toast } from "sonner";

import { claimTicket } from "@/lib/actions/tickets";
import type { Status } from "@/lib/db/schema";
import { Button } from "@/components/ui/button";

/**
 * One-click "Claim" for a ticket row/card. Renders only when the current MIS
 * member can claim it (unassigned or already theirs, and not yet resolved).
 * Stops propagation so it never also opens the row's detail Sheet.
 */
export function ClaimButton({
  ticketId,
  status,
  assigneeId,
  currentUserId,
  isAdmin,
  className,
}: {
  ticketId: string;
  status: Status;
  assigneeId: string | null;
  currentUserId: string;
  isAdmin: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const done = status === "RESOLVED" || status === "CLOSED";
  const mine = assigneeId === currentUserId;
  const working = mine && (status === "IN_PROGRESS" || status === "REOPENED");
  const canClaim = !done && !working && (!assigneeId || mine || isAdmin);
  if (!canClaim) return null;

  return (
    <Button
      size="sm"
      variant="outline"
      className={className}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        startTransition(async () => {
          const res = await claimTicket(ticketId);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Claimed — it is yours now");
          router.refresh();
        });
      }}
    >
      <Hand className="size-3.5" />
      Claim
    </Button>
  );
}
