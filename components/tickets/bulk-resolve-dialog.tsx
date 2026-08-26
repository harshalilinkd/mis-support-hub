"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { bulkResolveTickets } from "@/lib/actions/tickets";
import { formatDueDate, istDayKey, isUrl } from "@/lib/format";
import type { TicketAttachmentThumb } from "@/lib/db/queries";
import type { Department } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { AbsoluteTime } from "@/components/absolute-time";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AttachmentGrid } from "./attachment-grid";

/**
 * Per ticket, never per batch (§5.2): its own resolution date. `sameAsStart` is the
 * shortcut — plenty of fixes land the day work began, so answering "same" fills the
 * date from THAT ticket's own started_at instead of making anyone retype it. Choosing
 * "different" reveals a free date field. Either way the date that ships is the one on
 * screen, and it belongs to this ticket alone.
 */
type Entry = { sameAsStart: boolean; resolvedOn: string };

/**
 * What the wizard reads off a ticket — declared structurally rather than as one
 * query's row type, because it is opened from two lists whose selects differ (All
 * Issues and the "Assigned to Me" queue).
 */
export type BulkResolveTicket = {
  id: string;
  number: string;
  title: string;
  department: Department;
  createdAt: string | Date;
  createdByName: string | null;
  createdByImage?: string | null;
  description?: string | null;
  sheetLink: string | null;
  attachments: TicketAttachmentThumb[];
  startedAt?: string | Date | null;
};

/**
 * Resolve several of MY claimed tickets in one pass: step through each with Prev/Next,
 * say WHEN each fix actually landed, then submit them together. Each moves to RESOLVED
 * and its reporter is asked to verify it (§8).
 *
 * Admin-only in effect — the action applies canResolveIssue per ticket (§6), and the
 * lists only offer the rows that pass it. Every ticket keeps its own date as you
 * navigate; nothing bleeds across tickets.
 */
export function BulkResolveDialog({
  tickets,
  open,
  onOpenChange,
  onDone,
}: {
  tickets: BulkResolveTicket[];
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
  // drops a ticket), which would otherwise wipe priorities already picked. Values
  // are keyed by ticket id, so a shrunk set just leaves unused entries behind and
  // the current index is clamped in render.
  useEffect(() => {
    if (!open) return;
    setIndex(0);
    const today = istDayKey(new Date());
    setValues(
      Object.fromEntries(
        tickets.map((t) => {
          // Default to "same as started" where we know the start day. A ticket resolved
          // straight from Open (claimed but never started) has none, so it defaults to
          // today rather than silently inventing a date.
          const startDay = t.startedAt ? istDayKey(t.startedAt) : null;
          return [
            t.id,
            { sameAsStart: !!startDay, resolvedOn: startDay ?? today },
          ];
        })
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = tickets.length;
  const ticket = tickets[Math.min(index, total - 1)];
  const entry: Entry = (ticket && values[ticket.id]) ?? {
    sameAsStart: false,
    resolvedOn: istDayKey(new Date()),
  };
  // The start day of the ticket on screen — the "same as started" answer.
  const startDay = ticket?.startedAt ? istDayKey(ticket.startedAt) : null;
  // Every date is prefilled, so the only way to be incomplete is to clear one.
  const incomplete = tickets.filter((t) => !values[t.id]?.resolvedOn);

  function setEntry(patch: Partial<Entry>) {
    if (!ticket) return;
    setValues((v) => ({ ...v, [ticket.id]: { ...v[ticket.id], ...patch } }));
  }

  function submit() {
    // Dates are prefilled, so this only fires for one the user actively cleared —
    // jump to that ticket rather than defaulting it behind their back.
    if (incomplete.length > 0) {
      const first = incomplete[0];
      setIndex(tickets.findIndex((t) => t.id === first.id));
      toast.error(`Pick a resolution date for ${first.number}.`);
      return;
    }
    const items = tickets.map((t) => ({
      ticketId: t.id,
      // Each ticket ships its OWN date.
      resolvedOn: values[t.id]!.resolvedOn,
    }));
    startTransition(async () => {
      const res = await bulkResolveTickets({ items });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { resolved, failed } = res.data;
      if (resolved > 0) {
        toast.success(
          `Resolved ${resolved} ticket${resolved === 1 ? "" : "s"} — the reporters have been asked to confirm.`
        );
      }
      if (failed.length > 0) {
        // Name the reason the SERVER gave, per ticket. The old copy guessed
        // ("already started, or claimed by someone else"), which is useless when the
        // real cause is something else — you cannot act on a guess.
        const byNumber = new Map(tickets.map((t) => [t.id, t.number]));
        const lines = failed
          .slice(0, 3)
          .map((f) => `${byNumber.get(f.ticketId) ?? "A ticket"}: ${f.error}`);
        const more =
          failed.length > lines.length
            ? [`…and ${failed.length - lines.length} more`]
            : [];
        toast.error(
          [`${failed.length} couldn't be resolved.`, ...lines, ...more].join(" · ")
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
            Resolve {total} ticket{total === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Say when each fix actually landed, then resolve them all. Each reporter
            is asked to confirm the fix.
          </DialogDescription>
        </DialogHeader>

        {ticket ? (
          <>
            {/* Progress: a dot per ticket; the current one is highlighted. */}
            <div className="flex items-center gap-1.5 border-b border-border px-6 py-3">
              <span className="mr-1 text-xs font-medium text-text-muted">
                {index + 1} / {total}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {tickets.map((t, i) => (
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
                        : "bg-primary/60 hover:bg-primary"
                    )}
                  />
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              {/* Full ticket detail as submitted by the reporter — everything MIS
                  needs to confirm the fix landed. */}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-text-muted">
                  {ticket.number}
                </span>
                <span className="text-text-muted">·</span>
                <span className="text-text-muted">
                  {DEPARTMENT_LABELS[ticket.department]}
                </span>
              </div>
              <h3 className="mt-1 text-lg font-semibold">{ticket.title}</h3>

              {/* Who raised it + when */}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <UserAvatar
                    name={ticket.createdByName}
                    image={ticket.createdByImage}
                  />
                  <span className="font-medium text-foreground">
                    {ticket.createdByName ?? "Unknown reporter"}
                  </span>
                </span>
                <span className="text-text-muted">
                  Raised{" "}
                  <AbsoluteTime
                    date={ticket.createdAt}
                    className="font-mono text-foreground"
                  />
                </span>
              </div>

              {/* Problem description */}
              <div className="mt-4">
                <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Problem
                </h4>
                {ticket.description ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                    {ticket.description}
                  </p>
                ) : (
                  <p className="text-sm text-text-muted">
                    No description provided.
                  </p>
                )}
              </div>

              {/* Linked sheet / system */}
              {ticket.sheetLink ? (
                <div className="mt-4">
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    System / sheet
                  </h4>
                  {isUrl(ticket.sheetLink) ? (
                    <a
                      href={ticket.sheetLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="size-4" />
                      Open linked sheet
                    </a>
                  ) : (
                    <p className="break-words text-sm text-foreground">
                      {ticket.sheetLink}
                    </p>
                  )}
                </div>
              ) : null}

              {/* Attachments — full grid with lightbox, not just a thumbnail */}
              {ticket.attachments.length > 0 ? (
                <div className="mt-4">
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    Attachments
                  </h4>
                  <AttachmentGrid attachments={ticket.attachments} />
                </div>
              ) : null}

              {/* When did the fix land — per ticket (§5.2), never per batch. */}
              <div className="mt-5 space-y-4 sm:max-w-lg">
                <div>
                  <span className="mb-1.5 block text-sm font-medium">
                    Was it completed on the day work started?
                  </span>
                  {startDay ? (
                    <div className="flex gap-2">
                      {/* Two plain buttons, not a Select: it is a yes/no and both
                          answers should be one tap. */}
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={entry.sameAsStart}
                        onClick={() =>
                          setEntry({ sameAsStart: true, resolvedOn: startDay })
                        }
                        className={cn(
                          "flex-1 rounded-[var(--radius-input)] border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
                          entry.sameAsStart
                            ? "border-primary bg-accent-soft text-primary"
                            : "border-border text-foreground hover:bg-surface-muted"
                        )}
                      >
                        <span className="block font-medium">Same day</span>
                        <span className="block text-xs text-text-muted">
                          Started {formatDueDate(ticket.startedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={!entry.sameAsStart}
                        onClick={() => setEntry({ sameAsStart: false })}
                        className={cn(
                          "flex-1 rounded-[var(--radius-input)] border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
                          !entry.sameAsStart
                            ? "border-primary bg-accent-soft text-primary"
                            : "border-border text-foreground hover:bg-surface-muted"
                        )}
                      >
                        <span className="block font-medium">Different day</span>
                        <span className="block text-xs text-text-muted">
                          Pick the resolution date
                        </span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">
                      This ticket was never started, so there is no start date to match
                      — set the resolution date below.
                    </p>
                  )}
                </div>

                <div className="sm:max-w-[16rem]">
                  <label
                    htmlFor="bulk-resolve-date"
                    className="mb-1 block text-sm font-medium"
                  >
                    Resolved on
                  </label>
                  {/* Read-only when it mirrors the start date, so the value on screen
                      is always the value that ships. No min/max — any day (§5.2). */}
                  <Input
                    id="bulk-resolve-date"
                    type="date"
                    value={entry.resolvedOn}
                    onChange={(e) => setEntry({ resolvedOn: e.target.value })}
                    disabled={pending || (entry.sameAsStart && !!startDay)}
                    readOnly={entry.sameAsStart && !!startDay}
                  />
                  <p className="mt-1 text-xs text-text-muted">
                    The reporter is asked to confirm the fix.
                  </p>
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
                <span className="hidden text-xs text-text-muted sm:inline">
                  {incomplete.length > 0
                    ? `${incomplete.length} still need a date`
                    : "Ready — dates set per ticket"}
                </span>
                <Button type="button" onClick={submit} disabled={pending}>
                  <CheckCircle2 className="size-4" />
                  {pending ? "Resolving…" : `Resolve all ${total}`}
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
