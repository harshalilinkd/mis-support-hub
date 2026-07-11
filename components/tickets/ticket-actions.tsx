"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteTicket } from "@/lib/actions/tickets";
import type { Department } from "@/lib/db/schema";
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
import { EditTicketForm } from "./edit-ticket-form";

export function TicketActions({
  ticketId,
  number,
  defaults,
  canEdit,
  canDelete,
  onMutate,
}: {
  ticketId: string;
  number: string;
  defaults: {
    title: string;
    description: string;
    department: Department;
    sheetLink: string;
  };
  canEdit: boolean;
  canDelete: boolean;
  onMutate?: () => void;
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmDelete() {
    startTransition(async () => {
      const res = await deleteTicket(ticketId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Ticket ${number} moved to recycle bin`);
      setDeleteOpen(false);
      router.push("/my");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Ticket actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit ? (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
          ) : null}
          {canDelete ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit ticket {number}</DialogTitle>
            <DialogDescription>
              Update the subject, department, sheet link, or description.
            </DialogDescription>
          </DialogHeader>
          <EditTicketForm
            ticketId={ticketId}
            defaults={defaults}
            onSaved={() => {
              setEditOpen(false);
              onMutate?.();
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete ticket {number}?</DialogTitle>
            <DialogDescription>
              This moves the ticket to the recycle bin. An MIS admin can restore
              it — or delete it permanently — from Settings → Recycle Bin.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDeleteOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete ticket"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
