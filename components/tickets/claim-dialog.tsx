"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { claimTicket } from "@/lib/actions/tickets";
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
 * "Claim & start" dialog — the MIS member sets the priority + an estimated
 * resolution date before taking the ticket; the reporter is then notified that
 * work has started (with the priority and expected date).
 *
 * Works two ways: pass a `trigger` for a button, OR drive it with `open` /
 * `onOpenChange` to open it programmatically (e.g. after dragging a card to
 * "In Progress" on the board, or the status dropdown). `ticketId` may be null
 * while nothing is selected in the controlled case.
 */
export function ClaimDialog({
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

  const [priority, setPriority] = useState<string>("MEDIUM");
  const [deadline, setDeadline] = useState("");
  const [pending, startTransition] = useTransition();

  // Reset the fields each time it opens so every claim starts fresh.
  useEffect(() => {
    if (open) {
      setPriority("MEDIUM");
      setDeadline("");
    }
  }, [open]);

  function submit() {
    if (!ticketId) return;
    if (!deadline) {
      toast.error("Pick an estimated resolution date.");
      return;
    }
    startTransition(async () => {
      const res = await claimTicket({ ticketId, priority, deadline });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Claimed — it's yours now");
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
          <DialogTitle>Claim &amp; start work</DialogTitle>
          <DialogDescription>
            Set the priority and when you expect to resolve it. The ticket is
            assigned to you and the reporter is notified that work has started.
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

          <div>
            <label
              htmlFor="claim-deadline"
              className="mb-1 block text-sm font-medium"
            >
              Estimated resolution date
            </label>
            <Input
              id="claim-deadline"
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
          <Button type="button" onClick={submit} disabled={pending || !deadline}>
            {pending ? "Claiming…" : "Claim & start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
