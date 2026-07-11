"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { setPriority, updateStatus } from "@/lib/actions/tickets";
import type { Priority, Status } from "@/lib/db/schema";
import { humanizeEnum } from "@/lib/format";
import { STATUS_TRANSITIONS } from "@/lib/ticket-state";
import { PRIORITIES } from "@/lib/validators/ticket";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ClaimDialog } from "@/components/tickets/claim-dialog";
import { PriorityChip, StatusChip } from "@/components/tickets/chips";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function StatusControl({
  ticketId,
  status,
  locked = false,
}: {
  ticketId: string;
  status: Status;
  /** True when the ticket is claimed by someone else — render read-only (§6). */
  locked?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [claimOpen, setClaimOpen] = useState(false);
  const targets = STATUS_TRANSITIONS[status];

  function change(to: Status) {
    // Open → In Progress = claim: open the priority/deadline dialog so the ticket
    // is assigned to this member (mirrors the Claim button + board drag).
    if (status === "OPEN" && to === "IN_PROGRESS") {
      setClaimOpen(true);
      return;
    }
    startTransition(async () => {
      const res = await updateStatus(ticketId, to);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Status → ${humanizeEnum(to)}`);
      router.refresh();
    });
  }

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
              Move to {humanizeEnum(s)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <ClaimDialog
        ticketId={ticketId}
        open={claimOpen}
        onOpenChange={setClaimOpen}
        onDone={() => setClaimOpen(false)}
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
