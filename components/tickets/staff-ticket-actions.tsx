"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Hand, Play, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { releaseTicket } from "@/lib/actions/tickets";
import type { Role, Status } from "@/lib/db/schema";
import { canResolveIssue } from "@/lib/ticket-state";
import { Button } from "@/components/ui/button";
import { ClaimDialog } from "./claim-dialog";
import { ResolveDialog } from "./resolve-dialog";
import { StartTaskDialog } from "./start-task-dialog";

/**
 * MIS-only action bar on the ticket detail, following the claim → start flow (§5):
 *  1. Claim (assign to me + set priority) — the ticket stays Open.
 *  2. Start task (set a deadline) — moves it to In Progress; work has started.
 *  3. Mark resolved — once you're the assignee working on it.
 * A ticket claimed by someone else is read-only here — that person owns it
 * end-to-end (§6 ownership lock); there is no take-over or reassignment.
 */
export function StaffTicketActions({
  ticketId,
  status,
  assignedToId,
  assignedToName,
  currentUserId,
  currentUserRole,
  createdAt,
  onMutate,
}: {
  ticketId: string;
  status: Status;
  assignedToId: string | null;
  assignedToName: string | null;
  currentUserId: string;
  /** Drives the admin-only resolve gate (§6) — the same predicate the action uses. */
  currentUserRole: Role;
  /** When the ticket was raised — shown as context in the "Resolved on" picker (§5.2). */
  createdAt: Date | string;
  onMutate?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const done = status === "RESOLVED" || status === "CLOSED";
  const mine = assignedToId === currentUserId;
  // Resolving is admin + assignee (§6) — ONE shared predicate, so this can't drift from
  // the server's answer and offer a button that always fails.
  const canResolve = canResolveIssue(currentUserRole, mine);
  const working = mine && (status === "IN_PROGRESS" || status === "REOPENED");
  // Claimed by me but not started yet — sits Open, waiting for me to Start it.
  const claimedNotStarted = mine && status === "OPEN";
  const claimedByOther = !!assignedToId && !mine;

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
            {canResolve ? null : " An MIS admin marks it resolved."}
          </span>
          <div className="ml-auto flex gap-2">
            {/* Released from IN_PROGRESS too, not just from a claim (§5). Starting by
                mistake used to have no exit but "Mark resolved" — resolving work
                nobody did. This tells the reporter work stopped (§12.6's reversal
                rule), so the undo is honest rather than forbidden. */}
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                act(
                  () => releaseTicket(ticketId),
                  "Released — the reporter has been told it's back in the queue"
                )
              }
            >
              <Undo2 className="size-4" /> Release
            </Button>
            {/* ADMIN-ONLY (§6, canResolveIssue) — a staff assignee sees Release only,
                and the note above tells them who resolves it. Asks which DAY it was
                resolved (defaults to today): MIS often records a fix days later (§5.2). */}
            {canResolve ? (
              <ResolveDialog
                ticketId={ticketId}
                createdAt={createdAt}
                onDone={onMutate}
                trigger={
                  <Button size="sm" disabled={pending}>
                    <CheckCircle2 className="size-4" /> Mark resolved
                  </Button>
                }
              />
            ) : null}
          </div>
        </>
      ) : claimedNotStarted ? (
        <>
          <span className="text-sm text-text-muted">
            You&apos;ve claimed this — set a deadline to start work, or release it
            if you claimed it by mistake.
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                act(
                  () => releaseTicket(ticketId),
                  "Released — it's back in the open pool"
                )
              }
            >
              <Undo2 className="size-4" /> Release
            </Button>
            <StartTaskDialog
              ticketId={ticketId}
              onDone={onMutate}
              trigger={
                <Button size="sm" disabled={pending}>
                  <Play className="size-4" /> Start task
                </Button>
              }
            />
          </div>
        </>
      ) : claimedByOther ? (
        <span className="text-sm text-text-muted">
          {assignedToName ?? "Another staff member"}{" "}
          {status === "IN_PROGRESS" || status === "REOPENED"
            ? "is working on this ticket."
            : "has claimed this ticket."}{" "}
          Only they can resolve it.
        </span>
      ) : (
        <>
          <span className="text-sm text-text-muted">
            Pick this up to set a priority — it becomes yours and stays Open until
            you Start it.
          </span>
          <ClaimDialog
            ticketId={ticketId}
            onDone={onMutate}
            trigger={
              <Button className="ml-auto" size="sm" disabled={pending}>
                <Hand className="size-4" /> Claim
              </Button>
            }
          />
        </>
      )}
    </div>
  );
}
