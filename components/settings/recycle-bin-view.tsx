"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { permanentlyDeleteTicket, restoreTicket } from "@/lib/actions/tickets";
import type { Department, Priority, Status } from "@/lib/db/schema";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { AbsoluteTime } from "@/components/absolute-time";
import { PriorityChip, StatusChip } from "@/components/tickets/chips";
import { EmptyState } from "@/components/shell/empty-state";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Row = {
  id: string;
  number: string;
  title: string;
  department: Department;
  status: Status;
  priority: Priority | null;
  createdByName: string | null;
  deletedByName: string | null;
  deletedAt: string;
};

export function RecycleBinView({ tickets }: { tickets: Row[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Row | null>(null);

  function run(
    fn: () => Promise<{ ok: boolean; error?: string }>,
    success: string
  ) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        icon={<Trash2 className="size-5" />}
        title="Recycle bin is empty"
        description="Deleted tickets appear here. You can restore them or delete them permanently."
        seed={7}
      />
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)]">
        <Table>
          <TableHeader className="[&_th]:h-11 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
            <TableRow>
              <TableHead className="pl-4">Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Dept</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Deleted</TableHead>
              <TableHead className="pr-4 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.map((t) => (
              <TableRow key={t.id} className="[&>td]:py-2.5 [&>td]:align-top">
                <TableCell className="whitespace-nowrap pl-4 font-mono text-xs text-foreground">
                  {t.number}
                </TableCell>
                <TableCell>
                  <div className="max-w-[16rem] truncate text-sm font-medium">
                    {t.title}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap text-sm text-foreground">
                  {DEPARTMENT_LABELS[t.department]}
                </TableCell>
                <TableCell>
                  <StatusChip status={t.status} />
                </TableCell>
                <TableCell>
                  <PriorityChip priority={t.priority} />
                </TableCell>
                <TableCell className="max-w-[9rem] truncate text-sm text-foreground">
                  {t.createdByName ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <AbsoluteTime
                    date={t.deletedAt}
                    stacked
                    className="font-mono text-xs leading-tight tabular-nums text-foreground"
                  />
                  {t.deletedByName ? (
                    <div className="text-[11px] text-text-muted">
                      by {t.deletedByName}
                    </div>
                  ) : null}
                </TableCell>
                <TableCell className="pr-4 text-right">
                  <div className="inline-flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        run(() => restoreTicket(t.id), `${t.number} restored`)
                      }
                      disabled={pending}
                    >
                      <RotateCcw className="size-3.5" /> Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setConfirm(t)}
                      disabled={pending}
                    >
                      <Trash2 className="size-3.5" /> Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {confirm?.number} permanently?</DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. The ticket and all its comments,
              attachments, and history will be removed for good.
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
              disabled={pending}
              onClick={() => {
                const t = confirm;
                setConfirm(null);
                if (t)
                  run(
                    () => permanentlyDeleteTicket(t.id),
                    `${t.number} deleted permanently`
                  );
              }}
            >
              <Trash2 className="size-4" /> Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
