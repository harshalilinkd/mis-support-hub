"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Power, Trash2 } from "lucide-react";

import { setUserActive } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteUserDialog } from "./delete-user-dialog";
import { EditUserDialog } from "./edit-user-dialog";
import type { AdminUserView } from "./users-table";

export function UserRowActions({
  user,
  isSelf,
}: {
  user: AdminUserView;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  function toggleActive() {
    startTransition(async () => {
      const res = await setUserActive(user.id, !user.isActive);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (user.isActive) {
        const n = res.data.released;
        toast.success(
          n > 0
            ? `User deactivated — ${n} ticket${n === 1 ? "" : "s"} released to the pool`
            : "User deactivated"
        );
      } else {
        toast.success("User activated");
      }
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label="User actions"
            disabled={pending}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>
            <Pencil /> Edit
          </DropdownMenuItem>

          {!isSelf ? (
            <DropdownMenuItem onSelect={toggleActive}>
              <Power /> {user.isActive ? "Deactivate" : "Activate"}
            </DropdownMenuItem>
          ) : null}

          {!isSelf ? <DropdownMenuSeparator /> : null}

          {!isSelf ? (
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <EditUserDialog user={user} open={editOpen} onOpenChange={setEditOpen} />
      <DeleteUserDialog
        user={user}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />
    </>
  );
}
