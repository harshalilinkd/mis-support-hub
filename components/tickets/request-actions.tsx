"use client";

import { useEffect, useState, useTransition } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  PlayCircle,
  RotateCcw,
  Send,
  ThumbsUp,
} from "lucide-react";
import { toast } from "sonner";

import {
  markComplete,
  moveToReview,
  recordApprovalDecision,
  resumeWork,
  reviveRequest,
  sendForApproval,
  startWork,
} from "@/lib/actions/requests";
import { AbsoluteTime } from "@/components/absolute-time";
import type { RequestDetail } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { isStaff } from "@/lib/roles";
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
}: {
  request: RequestDetail;
  currentUser: SessionUser;
  onMutate?: () => void;
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

  const run = (label: string, fn: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(label);
      setDialog(null);
      onMutate?.();
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
      <NoteDialog open={dialog === "complete"} pending={pending} title="Mark build complete" label="Handover note (optional)" placeholder="Anything the requester should know before testing…" required={false} confirmLabel="Mark complete" onOpenChange={(o) => !o && setDialog(null)} onSubmit={(note) => run("Marked complete — ready for testing", () => markComplete({ ticketId: request.id, note }))} />
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

function NoteDialog({
  open,
  pending,
  title,
  label,
  placeholder,
  required,
  confirmLabel,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  title: string;
  label: string;
  placeholder: string;
  required: boolean;
  confirmLabel: string;
  onOpenChange: (o: boolean) => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  // Fresh form on every open (the wrapper stays mounted between opens).
  useEffect(() => {
    if (!open) return;
    setNote("");
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div>
          <label className="mb-1 block text-sm font-medium">{label}</label>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} disabled={pending} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button onClick={() => onSubmit(note)} disabled={pending || (required && !note.trim())}>
            {pending ? "Saving…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
