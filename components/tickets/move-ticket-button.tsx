"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";

import { moveTicketType } from "@/lib/actions/tickets";
import type { Status, TicketType } from "@/lib/db/schema";
import { canMoveTicketType } from "@/lib/ticket-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** The module a move sends the ticket TO, in words. */
const TARGET_LABEL: Record<TicketType, string> = {
  ISSUE: "System Requests",
  REQUEST: "Issues",
};

/**
 * "Move to the other module" (§12) — for a ticket filed in the wrong place. MIS-only
 * (the caller renders it just for staff/admin); hidden once the ticket is too far
 * along to move (`canMoveTicketType`). Moving renumbers it into the target sequence
 * and resets it to that module's intake stage, so on success we navigate to the new
 * number's detail. ISSUE → REQUEST collects the one field a request needs that an
 * issue doesn't: the expected benefit.
 */
export function MoveTicketButton({
  ticketId,
  number,
  currentType,
  status,
}: {
  ticketId: string;
  number: string;
  currentType: TicketType;
  status: Status;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [benefit, setBenefit] = useState("");
  const [pending, startTransition] = useTransition();

  if (!canMoveTicketType(currentType, status)) return null;

  const toRequest = currentType === "ISSUE";
  const targetLabel = TARGET_LABEL[currentType];

  function submit() {
    if (toRequest && !benefit.trim()) {
      toast.error("Add the expected benefit before moving.");
      return;
    }
    startTransition(async () => {
      const res = await moveTicketType({
        ticketId,
        expectedBenefit: toRequest ? benefit : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Moved ${number} to ${targetLabel} as ${res.data.number}`);
      setOpen(false);
      // The number changed, so the old URL is dead — go to the new ticket's detail.
      router.push(`/tickets/${res.data.number}`);
    });
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0"
        onClick={() => setOpen(true)}
        title={`This is filed as ${currentType === "ISSUE" ? "an issue" : "a request"} — move it to ${targetLabel}`}
      >
        <ArrowLeftRight className="size-4" /> Move to {targetLabel}
      </Button>

      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Move {number} to {targetLabel}?
            </DialogTitle>
            <DialogDescription>
              {toRequest
                ? "It gets a new REQ- number and starts at the Submitted stage in System Requests. Its title and description become the system name and problem statement."
                : "It gets a new MIS- number and starts at Open in Issues. The request brief is folded into the description."}{" "}
              Comments, attachments and history come with it. The current assignee,
              priority and delivery date are cleared.
            </DialogDescription>
          </DialogHeader>

          {toRequest ? (
            <div>
              <label
                htmlFor="move-benefit"
                className="mb-1 block text-sm font-medium"
              >
                Expected benefit
              </label>
              <Textarea
                id="move-benefit"
                rows={3}
                value={benefit}
                onChange={(e) => setBenefit(e.target.value)}
                placeholder="What will this new system achieve for the team?"
                disabled={pending}
              />
              <p className="mt-1 text-xs text-text-muted">
                A request needs this — the issue didn&apos;t capture it.
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={pending || (toRequest && !benefit.trim())}
            >
              {pending ? "Moving…" : `Move to ${targetLabel}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
