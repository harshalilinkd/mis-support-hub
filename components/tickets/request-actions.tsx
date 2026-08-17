"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  PlayCircle,
  RotateCcw,
  Send,
  ThumbsUp,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";

import {
  markComplete,
  moveToReview,
  recordApprovalDecision,
  releaseRequest,
  resumeWork,
  reviveRequest,
  sendForApproval,
  startWork,
} from "@/lib/actions/requests";
import { AbsoluteTime } from "@/components/absolute-time";
import type { RequestDetail } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { istDayKey } from "@/lib/format";
import { isStaff } from "@/lib/roles";
import { REQUEST_RELEASABLE_FROM } from "@/lib/ticket-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type ActionResult = { ok: true; data: unknown } | { ok: false; error: string };


/**
 * REQUEST workflow action bar (CLAUDE.md §12.3/§12.4). Shows exactly the moves the
 * current viewer may make from the current status; input-carrying moves (record
 * decision, claim, log progress, mark complete, request changes) open a small
 * dialog. Every action returns the standard {ok|error} and calls onMutate so the
 * surrounding detail reloads.
 */
export function RequestActions({
  request,
  currentUser,
  onMutate,
  onCompleted,
}: {
  request: RequestDetail;
  currentUser: SessionUser;
  onMutate?: () => void;
  /** Fired after markComplete succeeds, so the host can raise the §13.5 log prompt. */
  onCompleted?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<
    null | "decision" | "start" | "complete"
  >(null);

  const staff = isStaff(currentUser.role);
  const isAdmin = currentUser.role === "MIS_ADMIN";
  const isAssignee = request.assignedToId === currentUser.id;
  // Mirrors requestActorAllows() in lib/ticket-state.ts exactly — an assignee who
  // is no longer staff must not be offered build actions the server would reject.
  const canBuild = isAdmin || (staff && isAssignee);

  const run = (
    label: string,
    fn: () => Promise<ActionResult>,
    /** Runs only after the mutation succeeded — never gates it (§13.5 soft prompt). */
    onSuccess?: () => void
  ) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(label);
      setDialog(null);
      onMutate?.();
      onSuccess?.();
    });
  };

  const buttons: React.ReactNode[] = [];
  const s = request.status;

  if (s === "SUBMITTED" && staff) {
    buttons.push(
      <Button key="review" size="sm" disabled={pending} onClick={() => run("Moved to review", () => moveToReview(request.id))}>
        <ClipboardCheck className="size-4" /> Start review
      </Button>
    );
  }
  if (s === "UNDER_REVIEW" && staff) {
    buttons.push(
      <Button key="send" size="sm" disabled={pending} onClick={() => run("Sent for approval", () => sendForApproval(request.id))}>
        <Send className="size-4" /> Send for approval
      </Button>
    );
  }
  if (s === "PENDING_MD_APPROVAL" && isAdmin) {
    buttons.push(
      <Button key="decision" size="sm" disabled={pending} onClick={() => setDialog("decision")}>
        <ThumbsUp className="size-4" /> Record decision
      </Button>
    );
  }
  if (s === "DROPPED" && isAdmin) {
    buttons.push(
      <Button key="revive" size="sm" variant="outline" disabled={pending} onClick={() => run("Request revived", () => reviveRequest(request.id))}>
        <RotateCcw className="size-4" /> Revive
      </Button>
    );
  }
  if (s === "CLAIMED" && canBuild) {
    buttons.push(
      <Button key="start" size="sm" disabled={pending} onClick={() => setDialog("start")}>
        <PlayCircle className="size-4" /> Start building
      </Button>
    );
  }
  // Release is ASSIGNEE-LOCKED, not canBuild: an admin may start/work any build but
  // may only undo a claim/start they made themselves (§12.4). Offering it any wider
  // would dangle a button the server rejects.
  //
  // Offered from CLAIMED **and** from the started states — a build started by mistake
  // used to have no way back (§12.3 forbade it, and requests have no takeover), so the
  // only exit was to mark it complete. Releasing a started build tells the requester
  // the date no longer applies (§12.6's reversal rule).
  if (REQUEST_RELEASABLE_FROM.includes(s) && staff && isAssignee) {
    buttons.push(
      <Button
        key="release"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          run("Released — it's back in the approved pool", () => releaseRequest(request.id))
        }
      >
        <Undo2 className="size-4" /> Release
      </Button>
    );
  }
  if (s === "CHANGES_REQUESTED" && canBuild) {
    buttons.push(
      <Button key="resume" size="sm" disabled={pending} onClick={() => run("Back in progress", () => resumeWork(request.id))}>
        <PlayCircle className="size-4" /> Resume build
      </Button>
    );
  }
  if (s === "IN_PROGRESS" && canBuild) {
    buttons.push(
      <Button key="complete" size="sm" disabled={pending} onClick={() => setDialog("complete")}>
        <CheckCircle2 className="size-4" /> Mark complete
      </Button>
    );
  }
  // IN_TESTING is handled by <RequestUatPanel> — accept/request-changes are the
  // requester's calls, never MIS's, so they are deliberately absent here (§12.4).

  if (buttons.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-input)] border border-border bg-surface-muted/50 p-2.5">
        {buttons}
      </div>

      <DecisionDialog
        open={dialog === "decision"}
        pending={pending}
        adminName={currentUser.name ?? currentUser.email ?? "You"}
        onOpenChange={(o) => !o && setDialog(null)}
        onSubmit={(decision, remark) =>
          run(
            decision === "APPROVED" ? "Recorded: Approved" : "Recorded: Rejected",
            () => recordApprovalDecision({ ticketId: request.id, decision, remark })
          )
        }
      />
      <StartWorkDialog
        open={dialog === "start"}
        pending={pending}
        onOpenChange={(o) => !o && setDialog(null)}
        onSubmit={(deadline) =>
          run("Build started — the requester has the delivery date", () =>
            startWork({ ticketId: request.id, deadline })
          )
        }
      />
      {/* Asks WHEN the build was finished as well as the handover note (§5.2) — the
          request-side twin of the issue resolve dialog, for a build delivered on one day
          and recorded on another. */}
      <CompleteDialog
        open={dialog === "complete"}
        pending={pending}
        onOpenChange={(o) => !o && setDialog(null)}
        onSubmit={(note, completedOn) =>
          run(
            "Marked complete — ready for testing",
            () => markComplete({ ticketId: request.id, note, completedOn }),
            onCompleted
          )
        }
      />
    </>
  );
}

/* -------- dialogs -------- */

/**
 * Starting the build is where the delivery promise is made (§12.3, mirrors §5's
 * startTask) — so the date is required here, not at claim.
 */
function StartWorkDialog({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (deadline: string) => void;
}) {
  const [deadline, setDeadline] = useState("");
  useEffect(() => {
    if (open) setDeadline("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start building</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-text-muted">
          Set the date you expect to hand this back for testing. The requester is
          told, and any later change is recorded — a delivery date is never silent.
        </p>
        <div>
          <label htmlFor="start-deadline" className="mb-1 block text-sm font-medium">
            Delivery date
          </label>
          <Input
            id="start-deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            disabled={pending}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(deadline)} disabled={pending || !deadline}>
            {pending ? "Starting…" : "Start building"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecisionDialog({
  open,
  pending,
  adminName,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  adminName: string;
  onOpenChange: (o: boolean) => void;
  onSubmit: (decision: "APPROVED" | "REJECTED", remark: string) => void;
}) {
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [remark, setRemark] = useState("");
  // Stamped when the dialog opens, so the read-only line shows what will be saved.
  const [stampedAt, setStampedAt] = useState<string | null>(null);
  // Reset on every open. Without this the wrapper stays mounted between opens and
  // a previously-chosen "Reject" + remark silently persist — one click would then
  // DROP a request the admin meant to approve.
  useEffect(() => {
    if (!open) return;
    setDecision("APPROVED");
    setRemark("");
    setStampedAt(new Date().toISOString());
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record the MD&apos;s decision</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-text-muted">
          The MD does not log in. You are recording their decision{" "}
          <span className="font-medium text-foreground">on their behalf</span> — this is
          the accountability record for the approval.
        </p>
        <div className="flex gap-2">
          {(["APPROVED", "REJECTED"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDecision(d)}
              className={
                "flex-1 rounded-[var(--radius-input)] border px-3 py-2 text-sm font-medium transition-colors " +
                (decision === d
                  ? "border-primary bg-accent-soft text-primary"
                  : "border-border text-foreground hover:bg-surface-muted")
              }
            >
              {d === "APPROVED" ? "Approve" : "Reject"}
            </button>
          ))}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Remark <span className="font-normal text-text-muted">· optional, even when rejecting</span>
          </label>
          <Textarea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Any note from the discussion…" disabled={pending} />
        </div>
        {/* Read-only accountability line — exactly what gets saved (§12.5). */}
        <div className="rounded-[var(--radius-input)] border border-border bg-surface-muted px-3 py-2 text-xs text-text-muted">
          Recorded by{" "}
          <span className="font-medium text-foreground">{adminName}</span>
          {stampedAt ? (
            <>
              {" · "}
              {/* Same IST-pinned component the saved value renders with (§9), so the
                  preview can't disagree with what lands in the audit trail. */}
              <AbsoluteTime
                date={stampedAt}
                className="font-mono tabular-nums text-foreground"
              />
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={() => onSubmit(decision, remark)} disabled={pending}>
            {pending ? "Saving…" : "Record decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Marking the build complete (→ IN_TESTING): the completion DATE plus an optional
 * handover note.
 *
 * The date defaults to today and accepts **any** date, past or future, exactly like the
 * issue resolve dialog — §5.2 records why it is unbounded. It matters here for the same
 * reason: `completed_at` drives the "avg completion time" column of the Team performance
 * report (§10), so recording the day you got round to clicking rather than the day you
 * delivered overstates every build.
 */
function CompleteDialog({
  open,
  pending,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (note: string, completedOn: string) => void;
}) {
  const [note, setNote] = useState("");
  const [completedOn, setCompletedOn] = useState("");
  // Fresh form on every open (the wrapper stays mounted between opens), defaulted to
  // today — the common answer.
  useEffect(() => {
    if (!open) return;
    setNote("");
    setCompletedOn(istDayKey(new Date()));
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark build complete</DialogTitle>
        </DialogHeader>
        <div>
          <label htmlFor="completed-on" className="mb-1 block text-sm font-medium">
            Completed on
          </label>
          {/* No min/max — any past or future date (§5.2), matching the server. */}
          <Input
            id="completed-on"
            type="date"
            value={completedOn}
            onChange={(e) => setCompletedOn(e.target.value)}
            disabled={pending}
          />
          <p className="mt-1 text-xs text-text-muted">
            Today is filled in — change it if you finished the build earlier. Any date
            is allowed; a date other than today is recorded on the timeline.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Handover note (optional)
          </label>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything the requester should know before testing…" disabled={pending} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={() => onSubmit(note, completedOn)} disabled={pending || !completedOn}>
            {pending ? "Saving…" : "Mark complete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
