"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, Play } from "lucide-react";
import { toast } from "sonner";

import { bulkStartTasks } from "@/lib/actions/tickets";
import { formatDueDate, istDayKey, isUrl } from "@/lib/format";
import type { TicketListRow } from "@/lib/db/queries";
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
 * Per ticket, never per batch (§5.3): its own start date AND its own delivery
 * deadline. `sameAsClaim` is the shortcut the MIS team asked for — most tickets are
 * started the day they were claimed, so answering "same" fills the start date from
 * that ticket's own claim date instead of making them retype it. Choosing "different"
 * reveals a free date field. The resolved date is what ships either way.
 */
type Entry = { sameAsClaim: boolean; startedOn: string; deadline: string };

/**
 * Start several of MY claimed tickets in one pass: step through each with Prev/Next,
 * say when work began and when it should be done, then submit them together. Each
 * ticket moves OPEN/REOPENED → IN_PROGRESS and its reporter is told work has started
 * (§8), so the deadline is required here exactly as it is on the single Start task.
 *
 * Every ticket keeps its own entry as you navigate — the dates never bleed across
 * tickets. (Opened from the All Tickets selection bar.)
 */
export function BulkStartDialog({
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
          // Default to "same as claim" where we know the claim day — that is the
          // common case and makes the whole wizard a Next-Next-Start. A ticket
          // claimed before claimed_at existed has none, so it starts on "different"
          // with today filled in rather than silently inventing a date.
          const claimDay = t.claimedAt ? istDayKey(t.claimedAt) : null;
          return [
            t.id,
            {
              sameAsClaim: !!claimDay,
              startedOn: claimDay ?? today,
              deadline: "",
            },
          ];
        })
      )
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const total = tickets.length;
  const ticket = tickets[Math.min(index, total - 1)];
  const entry: Entry = (ticket && values[ticket.id]) ?? {
    sameAsClaim: false,
    startedOn: istDayKey(new Date()),
    deadline: "",
  };
  // The claim day of the ticket on screen — the "same as claimed" answer.
  const claimDay = ticket?.claimedAt ? istDayKey(ticket.claimedAt) : null;
  // Every ticket needs BOTH dates. A start date can only be missing if the user
  // cleared it; a deadline has no default at all, so this is the real gate.
  const incomplete = tickets.filter(
    (t) => !values[t.id]?.startedOn || !values[t.id]?.deadline
  );

  function setEntry(patch: Partial<Entry>) {
    if (!ticket) return;
    setValues((v) => ({ ...v, [ticket.id]: { ...v[ticket.id], ...patch } }));
  }

  function submit() {
    // A deadline is required per ticket (§5 — starting commits to a date), so jump to
    // the first ticket that is missing something rather than failing the whole batch
    // server-side with no idea which one it was.
    if (incomplete.length > 0) {
      const first = incomplete[0];
      setIndex(tickets.findIndex((t) => t.id === first.id));
      toast.error(
        values[first.id]?.deadline
          ? `Pick a start date for ${first.number}.`
          : `Set an expected completion date for ${first.number}.`
      );
      return;
    }
    const items = tickets.map((t) => ({
      ticketId: t.id,
      // Each ticket ships its OWN pair of dates.
      deadline: values[t.id]!.deadline,
      startedOn: values[t.id]!.startedOn,
    }));
    startTransition(async () => {
      const res = await bulkStartTasks({ items });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { started, failed } = res.data;
      if (started > 0) {
        toast.success(
          `Started ${started} ticket${started === 1 ? "" : "s"} — the reporters have been told.`
        );
      }
      if (failed.length > 0) {
        toast.error(
          `${failed.length} couldn't be started (already started, or claimed by someone else).`
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
            Start {total} ticket{total === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            Say when work began on each and when you expect to finish, then start
            them all. Each moves to In Progress and its reporter is told.
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
                  needs before committing to a completion date. */}
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

              {/* When did work start, and when is it due — per ticket (§5.3). */}
              <div className="mt-5 space-y-4 sm:max-w-lg">
                <div>
                  <span className="mb-1.5 block text-sm font-medium">
                    Did work start on the day it was claimed?
                  </span>
                  {claimDay ? (
                    <div className="flex gap-2">
                      {/* Two plain buttons, not a Select: it is a yes/no and both
                          answers should be one tap. */}
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={entry.sameAsClaim}
                        onClick={() =>
                          setEntry({ sameAsClaim: true, startedOn: claimDay })
                        }
                        className={cn(
                          "flex-1 rounded-[var(--radius-input)] border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
                          entry.sameAsClaim
                            ? "border-primary bg-accent-soft text-primary"
                            : "border-border text-foreground hover:bg-surface-muted"
                        )}
                      >
                        <span className="block font-medium">Same day</span>
                        <span className="block text-xs text-text-muted">
                          Claimed {formatDueDate(ticket.claimedAt)}
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        aria-pressed={!entry.sameAsClaim}
                        onClick={() => setEntry({ sameAsClaim: false })}
                        className={cn(
                          "flex-1 rounded-[var(--radius-input)] border px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
                          !entry.sameAsClaim
                            ? "border-primary bg-accent-soft text-primary"
                            : "border-border text-foreground hover:bg-surface-muted"
                        )}
                      >
                        <span className="block font-medium">Different day</span>
                        <span className="block text-xs text-text-muted">
                          Pick the start date
                        </span>
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-text-muted">
                      This ticket has no recorded claim date, so there is nothing to
                      match — set the start date below.
                    </p>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="bulk-start-date"
                      className="mb-1 block text-sm font-medium"
                    >
                      Start date
                    </label>
                    {/* Read-only when it mirrors the claim date, so the value on screen
                        is always the value that ships. No min/max — any day (§5.3). */}
                    <Input
                      id="bulk-start-date"
                      type="date"
                      value={entry.startedOn}
                      onChange={(e) => setEntry({ startedOn: e.target.value })}
                      disabled={pending || (entry.sameAsClaim && !!claimDay)}
                      readOnly={entry.sameAsClaim && !!claimDay}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="bulk-start-deadline"
                      className="mb-1 block text-sm font-medium"
                    >
                      Expected completion
                    </label>
                    <Input
                      id="bulk-start-deadline"
                      type="date"
                      value={entry.deadline}
                      onChange={(e) => setEntry({ deadline: e.target.value })}
                      disabled={pending}
                    />
                    <p className="mt-1 text-xs text-text-muted">
                      Required — the reporter is told this date.
                    </p>
                  </div>
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
                    : "Dates set per ticket"}
                </span>
                <Button type="button" onClick={submit} disabled={pending}>
                  <Play className="size-4" />
                  {pending ? "Starting…" : `Start all ${total}`}
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
