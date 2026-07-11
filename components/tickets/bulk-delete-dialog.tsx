"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { bulkDeleteTickets } from "@/lib/actions/tickets";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirm soft-deleting several selected tickets to the recycle bin. Soft delete
 * is restorable, so this is a light confirm (not the scary permanent-delete one).
 */
export function BulkDeleteDialog({
  ticketIds,
  open,
  onOpenChange,
  onDone,
}: {
  ticketIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const count = ticketIds.length;

  function submit() {
    if (count === 0) return;
    startTransition(async () => {
      const res = await bulkDeleteTickets({ ticketIds });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { deleted, failed } = res.data;
      if (deleted > 0) {
        toast.success(
          `Moved ${deleted} ticket${deleted === 1 ? "" : "s"} to the recycle bin`
        );
      }
      if (failed > 0) {
        toast.error(
          `${failed} couldn't be deleted — you may not have permission.`
        );
      }
      onOpenChange(false);
      onDone();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Delete {count} ticket{count === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription>
            {count === 1 ? "It" : "They"} will be moved to the recycle bin — you
            can restore {count === 1 ? "it" : "them"} anytime from Settings →
            Recycle Bin.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            onClick={submit}
            disabled={pending || count === 0}
          >
            <Trash2 className="size-4" />
            {pending ? "Deleting…" : `Delete ${count}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
