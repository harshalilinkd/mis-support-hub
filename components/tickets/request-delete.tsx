"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteTicket } from "@/lib/actions/tickets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Delete a REQUEST from its detail — moves it to the recycle bin (soft delete), the
 * same bin issues use (§9). Shown only when the viewer may delete it: an MIS_ADMIN
 * any time, or the requester while it's still SUBMITTED (deleteTicket enforces this
 * server-side, §6). Routes to /requests afterwards, since the request is now gone.
 */
export function RequestDelete({
  ticketId,
  number,
}: {
  ticketId: string;
  number: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await deleteTicket(ticketId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${number} moved to recycle bin`);
      setOpen(false);
      router.push("/requests");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Request actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => setOpen(true)}
          >
            <Trash2 className="size-4" /> Delete request
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete request {number}?</DialogTitle>
            <DialogDescription>
              This moves the request — its brief, progress logs, and conversation —
              to the recycle bin. An MIS admin can restore it, or delete it
              permanently, from Settings → Recycle Bin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? "Deleting…" : "Delete request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
