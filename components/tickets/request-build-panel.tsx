"use client";

import { useEffect, useState, useTransition } from "react";
import { CalendarClock, Hammer } from "lucide-react";
import { toast } from "sonner";

import { claimRequest, updateDeadline } from "@/lib/actions/requests";
import type { RequestDetail } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { formatDueDate, istDayKey } from "@/lib/format";
import { isStaff } from "@/lib/roles";
import { PRIORITIES } from "@/lib/validators/ticket";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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

const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

/**
 * Statuses where the build is still UNDER WAY, so the delivery date is live and
 * editable. IN_TESTING is deliberately NOT here: once marked complete the build has
 * been DELIVERED, so "is building this" and a re-scheduleable date are both wrong —
 * IN_TESTING gets its own past-tense, read-only "delivered" state below.
 */
const IN_FLIGHT = ["CLAIMED", "IN_PROGRESS", "CHANGES_REQUESTED"];

/**
 * Two faces of the same slot (P12 item 1):
 *  - APPROVED + unclaimed → a prominent "Claim this request" panel for MIS.
 *  - claimed/in-flight    → who is building it and by when, in plain sight for the
 *    requester, with the assignee able to move the date (never silently — the
 *    action audits it and notifies the requester).
 */
export function RequestBuildPanel({
  request,
  currentUser,
  onMutate,
}: {
  request: RequestDetail;
  currentUser: SessionUser;
  onMutate?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("MEDIUM");
  // The day the build was actually claimed (§5.3) — defaults to today, any date.
  const [claimedOn, setClaimedOn] = useState(() => istDayKey(new Date()));
  const [editing, setEditing] = useState(false);

  const staff = isStaff(currentUser.role);
  const isAdmin = currentUser.role === "MIS_ADMIN";
  const canSetDate = isAdmin || (staff && request.assignedToId === currentUser.id);

  const claimable = request.status === "APPROVED" && !request.assignedToId && staff;
  const inFlight = !!request.assignedToId && IN_FLIGHT.includes(request.status);
  // Build finished and handed over — the requester is now testing it. Read-only,
  // past tense, and NO "change date": you can't reschedule a delivery that happened.
  const delivered = !!request.assignedToId && request.status === "IN_TESTING";

  if (!claimable && !inFlight && !delivered) return null;

  if (delivered) {
    return (
      <div className="flex flex-wrap items-center gap-2.5 rounded-[var(--radius-input)] border border-border bg-surface-muted/50 p-3">
        <UserAvatar name={request.assignedToName} image={request.assignedToImage} />
        <div className="min-w-0 text-sm">
          <p className="truncate">
            <span className="font-medium">{request.assignedToName ?? "An MIS member"}</span>{" "}
            <span className="text-text-muted">
              finished the build — it&apos;s now in testing
            </span>
          </p>
          <p className="text-xs text-text-muted">
            {request.deadline ? (
              <>
                Delivered · target was{" "}
                <span className="font-mono text-foreground">
                  {formatDueDate(request.deadline)}
                </span>
              </>
            ) : (
              "Delivered"
            )}
          </p>
        </div>
      </div>
    );
  }

  if (claimable) {
    return (
      <div className="rounded-[var(--radius-input)] border border-primary/30 bg-accent-soft/50 p-4">
        <div className="flex items-center gap-2">
          <Hammer className="size-4 text-primary" />
          <h2 className="font-display text-sm font-semibold">Claim this request</h2>
        </div>
        <p className="mt-0.5 text-xs text-text-muted">
          It&apos;s approved and waiting for an MIS member. Claiming assigns it to you,
          sets its priority and records the day you took it on — you&apos;ll commit to a
          delivery date when you start work.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[9rem] flex-1">
            <label htmlFor="request-claim-date" className="mb-1 block text-xs font-medium">
              Claim date
            </label>
            {/* No min/max — any past or future date, matching the server (§5.3). */}
            <Input
              id="request-claim-date"
              type="date"
              value={claimedOn}
              onChange={(e) => setClaimedOn(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="min-w-[9rem] flex-1">
            <label className="mb-1 block text-xs font-medium">Priority</label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as (typeof PRIORITIES)[number])}
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
          <Button
            disabled={pending || !claimedOn}
            onClick={() =>
              startTransition(async () => {
                const res = await claimRequest({
                  ticketId: request.id,
                  priority,
                  claimedOn,
                });
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(`You're now building ${request.number}`);
                onMutate?.();
              })
            }
          >
            {pending ? "Claiming…" : "Claim"}
          </Button>
        </div>
      </div>
    );
  }

  // Claimed / in flight — who + by when, stated plainly.
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-input)] border border-border bg-surface-muted/50 p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar name={request.assignedToName} image={request.assignedToImage} />
          <div className="min-w-0 text-sm">
            <p className="truncate">
              <span className="font-medium">{request.assignedToName ?? "An MIS member"}</span>{" "}
              <span className="text-text-muted">is building this</span>
            </p>
            <p className="text-xs text-text-muted">
              {request.deadline ? (
                <>
                  Delivery by{" "}
                  <span className="font-mono font-medium text-foreground">
                    {formatDueDate(request.deadline)}
                  </span>
                </>
              ) : (
                "No delivery date set yet"
              )}
            </p>
            {/* The recorded claim/start days (§5.3) — not necessarily when the
                buttons were pressed. */}
            <p className="text-xs text-text-muted">
              {request.claimedAt ? `Claimed ${formatDueDate(request.claimedAt)}` : null}
              {request.claimedAt && request.startedAt ? " · " : null}
              {request.startedAt ? `Started ${formatDueDate(request.startedAt)}` : null}
            </p>
          </div>
        </div>
        {canSetDate ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            <CalendarClock className="size-4" /> Change date
          </Button>
        ) : null}
      </div>

      <DeadlineDialog
        open={editing}
        pending={pending}
        current={request.deadline}
        onOpenChange={setEditing}
        onSubmit={(next) =>
          startTransition(async () => {
            const res = await updateDeadline({ ticketId: request.id, deadline: next });
            if (!res.ok) {
              toast.error(res.error);
              return;
            }
            toast.success("Delivery date updated — the requester has been notified");
            setEditing(false);
            onMutate?.();
          })
        }
      />
    </>
  );
}

function DeadlineDialog({
  open,
  pending,
  current,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  current: Date | null;
  onOpenChange: (o: boolean) => void;
  onSubmit: (deadline: string) => void;
}) {
  const [value, setValue] = useState("");
  // Fresh on every open, pre-filled with the current date.
  useEffect(() => {
    if (!open) return;
    setValue(current ? new Date(current).toISOString().slice(0, 10) : "");
  }, [open, current]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change the delivery date</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-text-muted">
          The requester was promised a date, so this is recorded on the timeline and
          they&apos;re notified — a deadline change is never silent.
        </p>
        <div>
          <label htmlFor="new-deadline" className="mb-1 block text-sm font-medium">
            New delivery date
          </label>
          <Input
            id="new-deadline"
            type="date"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={pending}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(value)} disabled={pending || !value}>
            {pending ? "Saving…" : "Update date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
