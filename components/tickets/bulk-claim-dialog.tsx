"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Hand } from "lucide-react";
import { toast } from "sonner";

import { bulkClaimTickets } from "@/lib/actions/tickets";
import type { TicketListRow } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { DEPARTMENT_LABELS, PRIORITIES } from "@/lib/validators/ticket";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketLinkFiles } from "./ticket-link-files";

const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

type Entry = { priority: string; deadline: string };

/**
 * Claim several tickets in one pass: step through each selected ticket with
 * Prev/Next, set its priority + deadline, then submit them all together. Each
 * ticket keeps its own entry as you navigate. (Opened from the All Tickets
 * selection bar.)
 */
export function BulkClaimDialog({
  tickets,
  open,
  onOpenChange,
  onDone,
}: {
  tickets: TicketListRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState<Record<string, Entry>>({});
  const [pending, startTransition] = useTransition();

  // Initialise fresh entries only when the modal OPENS — not when the selection
  // set changes underneath an already-open modal (e.g. a background auto-refresh
  // drops a ticket), which would otherwise wipe priorities/deadlines already
  // typed. Values are keyed by ticket id, so a shrunk set just leaves unused
  // entries behind and the current index is clamped in render.
  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setValues(
      Object.fromEntries(
        tickets.map((t) => [t.id, { priority: "MEDIUM", deadline: "" }])
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = tickets.length;
  const ticket = tickets[Math.min(index, total - 1)];
  const entry: Entry = (ticket && values[ticket.id]) ?? {
    priority: "MEDIUM",
    deadline: "",
  };
  const remaining = tickets.filter((t) => !values[t.id]?.deadline).length;

  function setEntry(patch: Partial<Entry>) {
    if (!ticket) return;
    setValues((v) => ({ ...v, [ticket.id]: { ...v[ticket.id], ...patch } }));
  }

  function submit() {
    // Every ticket needs a deadline — jump to the first one that's missing.
    const missing = tickets.findIndex((t) => !values[t.id]?.deadline);
    if (missing !== -1) {
      setIndex(missing);
      toast.error("Set a deadline for every selected ticket.");
      return;
    }
    const items = tickets.map((t) => ({
      ticketId: t.id,
      priority: values[t.id]?.priority ?? "MEDIUM",
      deadline: values[t.id]!.deadline,
    }));
    startTransition(async () => {
      const res = await bulkClaimTickets({ items });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { claimed, failed } = res.data;
      if (claimed > 0) {
        toast.success(
          `Claimed ${claimed} ticket${claimed === 1 ? "" : "s"} — they're now yours.`
        );
      }
      if (failed.length > 0) {
        toast.error(
          `${failed.length} couldn't be claimed (already taken or resolved).`
        );
      }
      onOpenChange(false);
      onDone();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="border-b border-border px-6 py-4 text-left">
          <DialogTitle>
            Claim {total} ticket{total === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Set a priority and deadline for each, then claim them all. They&apos;ll
            be assigned to you and moved to In&nbsp;Progress.
          </DialogDescription>
        </DialogHeader>

        {ticket ? (
          <>
            {/* Progress: a dot per ticket (filled once its deadline is set). */}
            <div className="flex items-center gap-1.5 border-b border-border px-6 py-3">
              <span className="mr-1 text-xs font-medium text-text-muted">
                {index + 1} / {total}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {tickets.map((t, i) => {
                  const filled = !!values[t.id]?.deadline;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setIndex(i)}
                      aria-label={`Go to ${t.number}`}
                      aria-current={i === index}
                      className={cn(
                        "size-2.5 rounded-full transition-colors",
                        i === index
                          ? "bg-primary ring-2 ring-primary/30 ring-offset-1 ring-offset-background"
                          : filled
                            ? "bg-primary/60"
                            : "bg-border hover:bg-text-muted"
                      )}
                    />
                  );
                })}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {/* Ticket detail as submitted by the reporter */}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-text-muted">
                  {ticket.number}
                </span>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted">
                  {DEPARTMENT_LABELS[ticket.department]}
                </span>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted">
                  {ticket.createdByName ?? "Unknown reporter"}
                </span>
              </div>
              <h3 className="mt-1 text-lg font-semibold">{ticket.title}</h3>
              {ticket.description ? (
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">
                  {ticket.description}
                </p>
              ) : (
                <p className="mt-2 text-sm text-text-muted">
                  No description provided.
                </p>
              )}
              <div className="mt-3">
                <TicketLinkFiles
                  sheetLink={ticket.sheetLink}
                  attachments={ticket.attachments}
                />
              </div>

              {/* Priority + deadline for THIS ticket */}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium">
                    Priority
                  </label>
                  <Select
                    value={entry.priority}
                    onValueChange={(v) => setEntry({ priority: v })}
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
                    htmlFor="bulk-claim-deadline"
                    className="mb-1 block text-sm font-medium"
                  >
                    Deadline
                  </label>
                  <Input
                    id="bulk-claim-deadline"
                    type="date"
                    value={entry.deadline}
                    onChange={(e) => setEntry({ deadline: e.target.value })}
                    disabled={pending}
                  />
                </div>
              </div>
            </div>

            {/* Footer: navigation + submit */}
            <div className="flex items-center gap-2 border-t border-border px-6 py-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={pending || index === 0}
              >
                <ChevronLeft className="size-4" /> Prev
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                disabled={pending || index === total - 1}
              >
                Next <ChevronRight className="size-4" />
              </Button>
              <div className="ml-auto flex items-center gap-3">
                <span className="text-xs text-text-muted">
                  {remaining === 0
                    ? "All deadlines set"
                    : `Set a deadline for ${remaining} more ticket${remaining === 1 ? "" : "s"} to continue`}
                </span>
                {/* Blocked until every selected ticket has a deadline (priority
                    defaults to Medium, so deadlines are the gating input). */}
                <Button
                  type="button"
                  onClick={submit}
                  disabled={pending || remaining > 0}
                >
                  <Hand className="size-4" />
                  {pending ? "Claiming…" : `Claim all ${total}`}
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="px-6 py-12 text-center text-sm text-text-muted">
            No tickets selected.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
