"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { adminDeleteUser } from "@/lib/actions/users";
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
import type { AdminUserView } from "./users-table";

export function DeleteUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUserView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    startTransition(async () => {
      const res = await adminDeleteUser(user.id);
      if (!res.ok) {
        // Surface the failure reason (permission / transient error) and close.
        toast.error(res.error);
        onOpenChange(false);
        return;
      }
      toast.success(`${user.name ?? user.email} deleted`);
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user?</DialogTitle>
          <DialogDescription>
            This permanently removes{" "}
            <span className="font-medium text-foreground">
              {user.name ?? user.email}
            </span>{" "}
            ({user.email}) and revokes their access. Any tickets, comments, and
            activity they&apos;re part of are kept but reattributed to a
            &ldquo;Deleted user&rdquo; placeholder. This can&apos;t be undone.
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
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete user"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
