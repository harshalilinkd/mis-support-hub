"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { startTask } from "@/lib/actions/tickets";
import { istDayKey } from "@/lib/format";
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

/**
 * "Start task" dialog — the assignee sets an expected completion date to begin
 * work on a ticket they've already claimed. This is the second step of the
 * claim → start flow (§5): it moves the ticket OPEN/REOPENED → IN_PROGRESS and
 * notifies the reporter that work has officially started (with priority + ETA).
 *
 * Works two ways: pass a `trigger` for a button, OR drive it with `open` /
 * `onOpenChange` to open it programmatically (e.g. dragging your claimed card to
 * "In Progress" on the board, or the status dropdown). `ticketId` may be null
 * while nothing is selected in the controlled case.
 */
export function StartTaskDialog({
  ticketId,
  trigger,
  onDone,
  open: openProp,
  onOpenChange,
}: {
  ticketId: string | null;
  trigger?: React.ReactNode;
  onDone?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : internalOpen;
  const setOpen = (o: boolean) => {
    if (controlled) onOpenChange?.(o);
    else setInternalOpen(o);
  };

  const [deadline, setDeadline] = useState("");
  const [startedOn, setStartedOn] = useState("");
  const [pending, startTransition] = useTransition();

  // Reset each time it opens so every start begins fresh. The start date defaults to
  // today — the common answer — while the deadline stays empty, because there is no
  // sensible default for a date the assignee is committing to.
  useEffect(() => {
    if (open) {
      setDeadline("");
      setStartedOn(istDayKey(new Date()));
    }
  }, [open]);

  function submit() {
    if (!ticketId) return;
    if (!startedOn) {
      toast.error("Pick the date work started.");
      return;
    }
    startTransition(async () => {
      const res = await startTask({ ticketId, deadline, startedOn });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Task started — it's now In Progress");
      setOpen(false);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      {/* Stop clicks/keys from bubbling to an ancestor row/card onClick (which
          opens the ticket-detail sheet) — the field stays self-contained. */}
      <DialogContent
        className="max-w-md"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Start task</DialogTitle>
          <DialogDescription>
            Record when work started. A completion date is optional — add one if you
            can commit to it, and the reporter is told. The ticket moves to In Progress
            either way.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label
              htmlFor="start-date"
              className="mb-1 block text-sm font-medium"
            >
              Start date
            </label>
            {/* No min/max — any past or future date, matching the server (§5.3).
                Today is filled in, so the ordinary case is one click. */}
            <Input
              id="start-date"
              type="date"
              value={startedOn}
              onChange={(e) => setStartedOn(e.target.value)}
              disabled={pending}
            />
            <p className="mt-1 text-xs text-text-muted">
              When work actually began — change it if you started earlier. Any date is
              allowed; anything other than today is recorded on the timeline.
            </p>
          </div>

          <div>
            <label
              htmlFor="start-deadline"
              className="mb-1 block text-sm font-medium"
            >
              Expected completion date{" "}
              <span className="font-normal text-text-muted">· optional</span>
            </label>
            <Input
              id="start-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              disabled={pending}
            />
          </div>
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
            disabled={pending || !startedOn}
          >
            {pending ? "Starting…" : "Start task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
