"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Lock } from "lucide-react";
import { toast } from "sonner";

import { updateStatus } from "@/lib/actions/tickets";
import type { BoardTicketRow } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ClaimDialog } from "@/components/tickets/claim-dialog";

/**
 * The mobile board's move control — a clear, full-width action button that names
 * the destination (there's no dragging on touch). Open → In Progress goes through
 * the claim dialog (priority + deadline); In Progress → Resolved is a direct
 * status change. It runs the same server actions and ownership rules as dragging.
 */
export function BoardMoveControl({
  ticket,
  currentUser,
}: {
  ticket: BoardTicketRow;
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [claimOpen, setClaimOpen] = useState(false);

  // Mirror ClaimButton / the board's drag rules exactly (§6 ownership lock).
  const done = ticket.status === "RESOLVED" || ticket.status === "CLOSED";
  const mine = ticket.assignedToId === currentUser.id;
  const working =
    mine && (ticket.status === "IN_PROGRESS" || ticket.status === "REOPENED");
  const locked = !!(ticket.assignedToId && !mine);
  // Claimable = unassigned (or already mine but not yet started). This also
  // covers a REOPENED ticket that was left unassigned after a deactivation.
  const canClaim = !done && !working && (!ticket.assignedToId || mine);

  // Resolved / Closed sit in the last column — nothing to move from here.
  if (done) {
    return (
      <span className="text-xs text-text-muted">
        Resolved — waiting on the reporter to confirm.
      </span>
    );
  }

  if (locked) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
        <Lock className="size-3" />
        Claimed by {ticket.assignedToName ?? "someone else"}
      </span>
    );
  }

  // Claim → In Progress (asks for priority + an estimated date).
  if (canClaim) {
    return (
      <>
        <Button
          size="sm"
          className="h-9 w-full"
          onClick={() => setClaimOpen(true)}
        >
          Move to In Progress
          <ArrowRight className="size-4" />
        </Button>
        <ClaimDialog
          ticketId={ticket.id}
          open={claimOpen}
          onOpenChange={setClaimOpen}
          onDone={() => {
            setClaimOpen(false);
            router.refresh();
          }}
        />
      </>
    );
  }

  // In Progress / Reopened → Resolved (the assignee marks it fixed).
  function resolve() {
    startTransition(async () => {
      const res = await updateStatus(ticket.id, "RESOLVED");
      if (!res.ok) return void toast.error(res.error);
      toast.success(`${ticket.number} moved to Resolved`);
      router.refresh();
    });
  }

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-9 w-full"
      onClick={resolve}
      disabled={pending}
    >
      <Check className="size-4" />
      {pending ? "Moving…" : "Move to Resolved"}
    </Button>
  );
}
