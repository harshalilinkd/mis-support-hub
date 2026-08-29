"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { claimTicket } from "@/lib/actions/tickets";
import { istDayKey } from "@/lib/format";
import { PRIORITIES } from "@/lib/validators/ticket";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

/**
 * Claim dialog — the MIS member takes ownership of a ticket and sets its
 * priority. By default this is a plain claim: the ticket is assigned to them and
 * stays OPEN under "Assigned to Me"; work starts later via Start task (§5).
 *
 * Pass `withStart` for the combined "claim & start" shortcut (dragging/moving an
 * unassigned ticket straight to In Progress): it also asks for an expected
 * completion date and starts work in the same step, notifying the reporter.
 *
 * Works two ways: pass a `trigger` for a button, OR drive it with `open` /
 * `onOpenChange` to open it programmatically. `ticketId` may be null while
 * nothing is selected in the controlled case.
 */
export function ClaimDialog({
  ticketId,
  trigger,
  onDone,
  open: openProp,
  onOpenChange,
  withStart = false,
}: {
  ticketId: string | null;
  trigger?: React.ReactNode;
  onDone?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Combined claim & start: also collect a deadline and move to In Progress. */
  withStart?: boolean;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : internalOpen;
  const setOpen = (o: boolean) => {
    if (controlled) onOpenChange?.(o);
    else setInternalOpen(o);
  };

  const [priority, setPriority] = useState<string>("MEDIUM");
  const [deadline, setDeadline] = useState("");
  const [claimedOn, setClaimedOn] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [pending, startTransition] = useTransition();

  // Reset the fields each time it opens so every claim starts fresh. The two "when
  // did this happen" dates default to today — the common answer (§5.3); the deadline
  // stays empty, because a date being COMMITTED to has no sensible default.
  useEffect(() => {
    if (open) {
      const today = istDayKey(new Date());
      setPriority("MEDIUM");
      setDeadline("");
      setClaimedOn(today);
      setStartedOn(today);
    }
  }, [open]);

  function submit() {
    if (!ticketId) return;
    if (!claimedOn) {
      toast.error("Pick the date this was claimed.");
      return;
    }
    if (withStart && !startedOn) {
      toast.error("Pick the date work started.");
      return;
    }
    startTransition(async () => {
      const res = await claimTicket({
        ticketId,
        priority,
        claimedOn,
        // `start` is explicit — the deadline is optional now, so its presence can no
        // longer signal "also start this" (§5).
        ...(withStart ? { start: true, deadline, startedOn } : {}),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        withStart ? "Claimed & started — it's yours now" : "Claimed — it's yours now"
      );
      setOpen(false);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      {/* React portals bubble events through the component tree, not the DOM, so
          a click/keydown on the Priority select or date field would otherwise
          bubble to an ancestor row/card onClick (which opens the ticket-detail
          sheet). Stop it at the dialog content so the fields are self-contained. */}
      <DialogContent
        className="max-w-md"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>
            {withStart ? "Claim & start work" : "Claim ticket"}
          </DialogTitle>
          <DialogDescription>
            {withStart
              ? "Set the priority and the dates. The ticket is assigned to you, moved to In Progress, and the reporter is notified work has started."
              : "Set the priority, the date you took it on, and take ownership. It's assigned to you and stays Open until you Start the task."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Priority</label>
            <Select
              value={priority}
              onValueChange={setPriority}
              disabled={pending}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* When ownership was actually taken (§5.3). No min/max — any past or
              future date, matching the server. Today is filled in. */}
          <div>
            <label
              htmlFor="claim-date"
              className="mb-1 block text-sm font-medium"
            >
              Claim date
            </label>
            <Input
              id="claim-date"
              type="date"
              value={claimedOn}
              onChange={(e) => setClaimedOn(e.target.value)}
              disabled={pending}
            />
            <p className="mt-1 text-xs text-text-muted">
              When you actually took this on — change it if that was earlier. Any date
              is allowed; anything other than today is recorded on the timeline.
            </p>
          </div>

          {withStart ? (
            <>
              <div>
                <label
                  htmlFor="claim-start-date"
                  className="mb-1 block text-sm font-medium"
                >
                  Start date
                </label>
                <Input
                  id="claim-start-date"
                  type="date"
                  value={startedOn}
                  onChange={(e) => setStartedOn(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div>
                <label
                  htmlFor="claim-deadline"
                  className="mb-1 block text-sm font-medium"
                >
                  Expected completion date{" "}
                  <span className="font-normal text-text-muted">· optional</span>
                </label>
                <Input
                  id="claim-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={pending}
                />
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={submit}
            disabled={
              pending || !claimedOn || (withStart && !startedOn)
            }
          >
            {pending ? "Claiming…" : withStart ? "Claim & start" : "Claim"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
