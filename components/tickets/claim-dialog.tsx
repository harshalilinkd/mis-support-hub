"use client";

import { useState, useTransition } from "react";
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
 */
export function ClaimDialog({
  ticketId,
  trigger,
  onDone,
}: {
  ticketId: string;
  trigger: React.ReactNode;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [priority, setPriority] = useState<string>("MEDIUM");
  const [deadline, setDeadline] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Claim &amp; start work</DialogTitle>
          <DialogDescription>
            Set the priority and when you expect to resolve it. The reporter is
            notified that work has started.
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
