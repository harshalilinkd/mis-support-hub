"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { setPriority, updateStatus } from "@/lib/actions/tickets";
import type { Priority, Role, Status } from "@/lib/db/schema";
import { humanizeEnum } from "@/lib/format";
import { canResolveIssue, STATUS_TRANSITIONS } from "@/lib/ticket-state";
import { PRIORITIES } from "@/lib/validators/ticket";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClaimDialog } from "@/components/tickets/claim-dialog";
import { ResolveDialog } from "@/components/tickets/resolve-dialog";
import { StartTaskDialog } from "@/components/tickets/start-task-dialog";
import { PriorityChip, StatusChip } from "@/components/tickets/chips";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function StatusControl({
  ticketId,
  status,
  locked = false,
  mine = false,
  role,
  createdAt,
}: {
  ticketId: string;
  status: Status;
  /** True when the ticket is claimed by someone else — render read-only (§6). */
  locked?: boolean;
  /** True when the ticket is assigned to the current user (drives start vs claim). */
  mine?: boolean;
  /**
   * The viewer's role — decides whether "Mark resolved" is offered at all (§6:
   * admin + assignee). Passed in rather than each call site computing the rule, so
   * there is ONE copy of it.
   */
  role: Role;
  /** When the ticket was raised — shown as context in the "Resolved on" picker (§5.2). */
  createdAt?: Date | string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [claimOpen, setClaimOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  // Resolving is admin + assignee (§6): drop it from the menu for anyone else rather
  // than offering a move the server refuses.
  const canResolve = canResolveIssue(role, mine);
  const targets = STATUS_TRANSITIONS[status].filter(
    (s) => s !== "RESOLVED" || canResolve
  );

  function change(to: Status) {
    // Open → In Progress = start work (§5). If I've already claimed it, ask only
    // for a deadline (Start task); if it's unassigned, this is the combined
    // "claim & start" shortcut (priority + deadline).
    if (status === "OPEN" && to === "IN_PROGRESS") {
      if (mine) setStartOpen(true);
      else setClaimOpen(true);
      return;
    }
    // Resolving asks which day the work finished (§5) — same dialog as the detail,
    // so a row can't resolve a ticket by a route that skips the date.
    if (to === "RESOLVED") {
      setResolveOpen(true);
      return;
    }
    startTransition(async () => {
      const res = await updateStatus(ticketId, to);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Status → ${humanizeEnum(to)}`);
      router.refresh();
    });
  }

  // Label the items that open a dialog with an ellipsis (they ask for something).
  const label = (to: Status) =>
    status === "OPEN" && to === "IN_PROGRESS"
      ? mine
        ? "Start task…"
        : "Claim & start…"
      : to === "RESOLVED"
        ? "Mark resolved…"
        : `Move to ${humanizeEnum(to)}`;

  // Read-only when locked (claimed by someone else) or terminal (no transitions).
  if (locked || targets.length === 0) return <StatusChip status={status} />;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pending}
            onClick={stop}
            aria-label="Change status"
            className="inline-flex items-center gap-1 rounded-[6px] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          >
            <StatusChip status={status} />
            <ChevronDown className="size-3 text-text-muted" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onClick={stop}>
          {targets.map((s) => (
            <DropdownMenuItem key={s} onSelect={() => change(s)}>
              {label(s)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Unassigned Open → In Progress: combined claim & start (priority + date). */}
      <ClaimDialog
        ticketId={ticketId}
        open={claimOpen}
        onOpenChange={setClaimOpen}
        onDone={() => setClaimOpen(false)}
        withStart
      />
      {/* Already mine, Open → In Progress: just set a deadline to start. */}
      <StartTaskDialog
        ticketId={ticketId}
        open={startOpen}
        onOpenChange={setStartOpen}
        onDone={() => setStartOpen(false)}
      />
      {/* → Resolved: record the day the work actually finished (defaults to today). */}
      <ResolveDialog
        ticketId={ticketId}
        createdAt={createdAt}
        open={resolveOpen}
        onOpenChange={setResolveOpen}
        onDone={() => setResolveOpen(false)}
      />
    </>
  );
}

export function PriorityControl({
  ticketId,
  priority,
  locked = false,
}: {
  ticketId: string;
  priority: Priority | null;
  /** True when the ticket is claimed by someone else — render read-only (§6). */
  locked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(to: Priority) {
    if (to === priority) return;
    startTransition(async () => {
      const res = await setPriority(ticketId, to);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Priority → ${humanizeEnum(to)}`);
      router.refresh();
    });
  }

  // Read-only when locked (only the assignee re-prioritises their claimed ticket).
  if (locked) return <PriorityChip priority={priority} />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          onClick={stop}
          aria-label="Change priority"
          className="inline-flex items-center gap-1 rounded-[6px] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <PriorityChip priority={priority} />
          <ChevronDown className="size-3 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={stop}>
        {PRIORITIES.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => change(p)}>
            {humanizeEnum(p)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// NOTE: there is intentionally no AssigneeControl. Assignment happens only by
// claiming an unassigned ticket, and a claimed ticket can't be reassigned or
// unassigned by anyone — the assignee owns it end-to-end (§6 ownership lock).
