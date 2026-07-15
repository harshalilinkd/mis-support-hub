"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { startTask } from "@/lib/actions/tickets";
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
  const [pending, startTransition] = useTransition();

  // Reset each time it opens so every start begins fresh.
  useEffect(() => {
    if (open) setDeadline("");
  }, [open]);

  function submit() {
    if (!ticketId) return;
    if (!deadline) {
      toast.error("Pick an expected completion date.");
      return;
    }
    startTransition(async () => {
      const res = await startTask({ ticketId, deadline });
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
            Set an expected completion date to begin work. The ticket moves to In
            Progress and the reporter is notified that work has started.
          </DialogDescription>
        </DialogHeader>

        <div>
          <label
            htmlFor="start-deadline"
            className="mb-1 block text-sm font-medium"
          >
            Expected completion date
          </label>
          <Input
            id="start-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            disabled={pending}
          />
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="button" onClick={submit} disabled={pending || !deadline}>
            {pending ? "Starting…" : "Start task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
