"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  bulkPermanentlyDeleteTickets,
  emptyRecycleBin,
  permanentlyDeleteTicket,
  restoreTicket,
} from "@/lib/actions/tickets";
import type { Department, Priority, Status } from "@/lib/db/schema";
import { DeletedTicketDialog } from "./deleted-ticket-dialog";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { AbsoluteTime } from "@/components/absolute-time";
import { PriorityChip, StatusChip } from "@/components/tickets/chips";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  // The row/card opens a read-only preview — an admin should see WHAT they are about
  // to restore or purge, which the bin could not show at all before.
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Two destructive confirmations, kept apart on purpose: one for the selection, one
  // for the whole bin. The second is the more dangerous act and gets a typed gate.
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [emptyPhrase, setEmptyPhrase] = useState("");

  const allSelected =
    tickets.length > 0 && tickets.every((t) => selectedIds.has(t.id));

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(tickets.map((t) => t.id)));
  }

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

  const selectedCount = selectedIds.size;

  return (
    <>
      {/* Bin-level actions. "Empty" sits apart from the selection bar because it is a
          different act: not "these ones" but "everything, including rows not on
          screen". */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {selectedCount > 0 ? (
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-input)] border border-destructive/30 bg-destructive/5 px-3 py-2">
            <span className="text-sm font-medium">{selectedCount} selected</span>
            <Button
              size="sm"
              variant="destructive"
              disabled={pending}
              onClick={() => setConfirmBulk(true)}
            >
              <Trash2 className="size-4" /> Delete permanently
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto text-destructive hover:text-destructive"
          disabled={pending}
          onClick={() => {
            setEmptyPhrase("");
            setConfirmEmpty(true);
          }}
        >
          <Trash2 className="size-4" /> Empty recycle bin ({tickets.length})
        </Button>
      </div>

      {/* Phone: one card per deleted ticket. Restore and Delete-for-good are the point
          of this screen, so they must be reachable without scrolling a table sideways —
          in a scroller they sit in the last column, furthest from the ticket they act on. */}
      <ul className="space-y-2 md:hidden">
        {tickets.map((t) => (
          <li
            key={t.id}
            className="rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-[var(--shadow-elevation)]"
          >
            <div className="mb-2 flex items-center gap-2">
              <Checkbox
                checked={selectedIds.has(t.id)}
                onCheckedChange={() => toggleSelect(t.id)}
                aria-label={`Select ${t.number}`}
              />
              <span className="text-xs text-text-muted">Select</span>
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => setPreview(t.id)}
              onKeyDown={(e) => {
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPreview(t.id);
                }
              }}
              aria-label={`Open ${t.number}`}
              className="cursor-pointer rounded-[6px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-mono text-xs font-semibold">
                {t.number}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {t.title}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusChip status={t.status} />
              <PriorityChip priority={t.priority} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
              <span>{DEPARTMENT_LABELS[t.department]}</span>
              <span aria-hidden>·</span>
              <span className="truncate">{t.createdByName ?? "—"}</span>
            </div>
            <div className="mt-1 text-xs text-text-muted">
              Deleted{" "}
              <AbsoluteTime
                date={t.deletedAt}
                dateOnly
                className="font-mono tabular-nums"
              />
              {t.deletedByName ? ` by ${t.deletedByName}` : null}
            </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => run(() => restoreTicket(t.id), `${t.number} restored`)}
                disabled={pending}
              >
                <RotateCcw className="size-3.5" /> Restore
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="flex-1 text-destructive hover:text-destructive"
                onClick={() => setConfirm(t)}
                disabled={pending}
              >
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)] md:block">
        <Table>
          <TableHeader className="[&_th]:h-11 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
            <TableRow>
              <TableHead className="w-9 pl-4">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all deleted tickets"
                />
              </TableHead>
              <TableHead>Number</TableHead>
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
              <TableRow
                key={t.id}
                data-state={selectedIds.has(t.id) ? "selected" : undefined}
                onClick={() => setPreview(t.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  // Only when the row itself has focus — not a bubbled keystroke
                  // from the Restore / Delete buttons inside it.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPreview(t.id);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-surface-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&>td]:py-2.5 [&>td]:align-top"
              >
                <TableCell
                  className="w-9 pl-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={selectedIds.has(t.id)}
                    onCheckedChange={() => toggleSelect(t.id)}
                    aria-label={`Select ${t.number}`}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs text-foreground">
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
                <TableCell
                  className="pr-4 text-right"
                  onClick={(e) => e.stopPropagation()}
                >
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

      {/* Selection purge — names the count, and says what goes with each ticket. */}
      <Dialog open={confirmBulk} onOpenChange={(o) => !o && setConfirmBulk(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Delete {selectedCount} ticket{selectedCount === 1 ? "" : "s"}{" "}
              permanently?
            </DialogTitle>
            <DialogDescription>
              This can&apos;t be undone. Each ticket and all its comments,
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
              onClick={() =>
                run(async () => {
                  const res = await bulkPermanentlyDeleteTickets({
                    ticketIds: [...selectedIds],
                  });
                  if (res.ok) {
                    setConfirmBulk(false);
                    setSelectedIds(new Set());
                  }
                  return res;
                }, `${selectedCount} ticket${selectedCount === 1 ? "" : "s"} deleted for good`)
              }
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Emptying the bin is the most destructive action in the app, and it reaches
          rows that are not on screen — so it asks for the word to be typed rather than
          relying on a single click landing on the right button. */}
      <Dialog open={confirmEmpty} onOpenChange={(o) => !o && setConfirmEmpty(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Empty the recycle bin?</DialogTitle>
            <DialogDescription>
              All {tickets.length} deleted ticket
              {tickets.length === 1 ? "" : "s"} — issues and system requests — will be
              removed for good, along with their comments, attachments, and history.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label
              htmlFor="empty-confirm"
              className="mb-1 block text-sm font-medium"
            >
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </label>
            <Input
              id="empty-confirm"
              value={emptyPhrase}
              onChange={(e) => setEmptyPhrase(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              disabled={pending}
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="destructive"
              disabled={pending || emptyPhrase.trim().toUpperCase() !== "DELETE"}
              onClick={() =>
                run(async () => {
                  const res = await emptyRecycleBin();
                  if (res.ok) {
                    setConfirmEmpty(false);
                    setSelectedIds(new Set());
                  }
                  return res;
                }, "Recycle bin emptied")
              }
            >
              {pending ? "Emptying…" : "Empty recycle bin"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeletedTicketDialog
        ticketId={preview}
        onOpenChange={(o) => !o && setPreview(null)}
      />

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
