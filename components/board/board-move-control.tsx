"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Lock, Play } from "lucide-react";

import type { BoardTicketRow } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { canResolveIssue } from "@/lib/ticket-state";
import { Button } from "@/components/ui/button";
import { ClaimDialog } from "@/components/tickets/claim-dialog";
import { ResolveDialog } from "@/components/tickets/resolve-dialog";
import { StartTaskDialog } from "@/components/tickets/start-task-dialog";

/**
 * The mobile board's move control — a clear, full-width action button that names
 * the action (there's no dragging on touch). Following the claim → start flow (§5):
 * an unassigned Open ticket gets "Move to In Progress" (combined claim & start:
 * priority + deadline); a ticket I've already claimed gets "Start task" (deadline);
 * In Progress → Resolved is a direct status change. Same server actions and
 * ownership rules as dragging.
 */
export function BoardMoveControl({
  ticket,
  currentUser,
}: {
  ticket: BoardTicketRow;
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const [claimOpen, setClaimOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);

  // Mirror ClaimButton / the board's drag rules exactly (§6 ownership lock).
  const done = ticket.status === "RESOLVED" || ticket.status === "CLOSED";
  const mine = ticket.assignedToId === currentUser.id;
  const locked = !!(ticket.assignedToId && !mine);
  // Claimed by me but Open = ready to start (just needs a deadline).
  const mineNotStarted = mine && ticket.status === "OPEN";
  // Unassigned + active = claimable (also covers a REOPENED ticket left
  // unassigned after a deactivation).
  const unclaimed =
    !ticket.assignedToId &&
    (ticket.status === "OPEN" || ticket.status === "REOPENED");

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

  // Already mine, not started → Start task (asks for a completion date).
  if (mineNotStarted) {
    return (
      <>
        <Button
          size="sm"
          className="h-9 w-full"
          onClick={() => setStartOpen(true)}
        >
          <Play className="size-4" />
          Start task
        </Button>
        <StartTaskDialog
          ticketId={ticket.id}
          open={startOpen}
          onOpenChange={setStartOpen}
          onDone={() => {
            setStartOpen(false);
            router.refresh();
          }}
        />
      </>
    );
  }

  // Unassigned → claim & start in one move (asks for priority + a date).
  if (unclaimed) {
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
          withStart
        />
      </>
    );
  }

  // In Progress / Reopened → Resolved — ADMIN + assignee only (§6). A staff assignee
  // gets no move here; an admin resolves it (or they release it first).
  if (!canResolveIssue(currentUser.role, mine)) {
    return (
      <span className="text-xs text-text-muted">
        An MIS admin marks this resolved.
      </span>
    );
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-9 w-full"
        onClick={() => setResolveOpen(true)}
      >
        <Check className="size-4" />
        Move to Resolved
      </Button>
      <ResolveDialog
        ticketId={ticket.id}
        ticketNumber={ticket.number}
        createdAt={ticket.createdAt}
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        onDone={() => {
          setResolveOpen(false);
          router.refresh();
        }}
      />
    </>
  );
}
