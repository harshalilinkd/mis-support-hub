"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateStatus } from "@/lib/actions/tickets";
import { formatDueDate, istDayKey } from "@/lib/format";
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

/**
 * "Mark resolved" dialog — the admin assignee records WHEN the issue was actually
 * resolved (§5.2). It defaults to today, so the common case is one extra click; the point
 * of the field is the other case, where MIS fixed something on Tuesday and only gets
 * round to closing the ticket on Thursday. Recording Thursday would overstate how long
 * the fix took in every dashboard average (§10), and tell the reporter the wrong story.
 *
 * **Any date is allowed, past or future** — deliberately unbounded, matching the server
 * (§5.2 records why). `createdAt` is optional context shown under the field ("Raised
 * 13 Aug 2026"), not a bound.
 *
 * Same two shapes as StartTaskDialog: pass a `trigger`, or drive `open`/`onOpenChange`
 * to open it programmatically (board drag, status dropdown, mobile move).
 */
export function ResolveDialog({
  ticketId,
  ticketNumber,
  createdAt,
  trigger,
  onDone,
  open: openProp,
  onOpenChange,
}: {
  ticketId: string | null;
  ticketNumber?: string;
  createdAt?: Date | string | null;
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

  const [resolvedOn, setResolvedOn] = useState("");
  const [pending, startTransition] = useTransition();

  // Recomputed when the dialog opens (not per render) so "today" can't shift under the
  // user mid-dialog. There are deliberately NO min/max bounds — see §5.2.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const today = useMemo(() => istDayKey(new Date()), [open]);

  // Default to today each time it opens — the overwhelmingly common answer.
  useEffect(() => {
    if (open) setResolvedOn(today);
  }, [open, today]);

  const dated = !!resolvedOn && resolvedOn !== today;

  function submit() {
    if (!ticketId) return;
    if (!resolvedOn) {
      toast.error("Pick the date this was resolved.");
      return;
    }
    startTransition(async () => {
      const res = await updateStatus(ticketId, "RESOLVED", resolvedOn);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        dated
          ? `Resolved — dated ${formatDueDate(`${resolvedOn}T12:00:00+05:30`)}`
          : `${ticketNumber ?? "Ticket"} resolved`
      );
      setOpen(false);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      {/* Stop clicks/keys from bubbling to an ancestor row/card onClick (which opens
          the ticket-detail sheet) — the field stays self-contained. */}
      <DialogContent
        className="max-w-md"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Mark resolved</DialogTitle>
          <DialogDescription>
            When was this actually resolved? Today is filled in — change it if the fix
            was done earlier. The reporter is notified either way and can confirm or
            reopen.
          </DialogDescription>
        </DialogHeader>

        <div>
          <label
            htmlFor="resolved-on"
            className="mb-1 block text-sm font-medium"
          >
            Resolved on
          </label>
          {/* No min/max: any date, past or future, is allowed by product decision
              (§5.2). The server accepts the same set, so the two agree. */}
          <Input
            id="resolved-on"
            type="date"
            value={resolvedOn}
            onChange={(e) => setResolvedOn(e.target.value)}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-text-muted">
            {dated
              ? "Not today — the date you chose is recorded in the ticket's activity."
              : createdAt
                ? `Any past or future date is allowed. Raised ${formatDueDate(createdAt)}.`
                : "Any past or future date is allowed."}
          </p>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !resolvedOn}
          >
            {pending ? "Resolving…" : "Mark resolved"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
