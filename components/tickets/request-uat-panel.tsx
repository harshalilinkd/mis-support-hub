"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, Hourglass, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { attachTo } from "@/lib/actions/attachments";
import { acceptRequest, requestChanges } from "@/lib/actions/requests";
import type { AttachmentMeta } from "@/lib/attachments";
import type { RequestDetail } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileDropzone } from "./file-dropzone";

/**
 * The UAT gate (§12.3/§12.4). Only the requester can accept & close, or send it
 * back for changes — MIS may NEVER force-close, so for them this is a read-only
 * "waiting" state with no close affordance at all. The loop is uncapped: each
 * round bumps revision_round.
 */
export function RequestUatPanel({
  request,
  currentUser,
  onMutate,
}: {
  request: RequestDetail;
  currentUser: SessionUser;
  onMutate?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);

  if (request.status !== "IN_TESTING") return null;

  const isRequester = request.createdById === currentUser.id;
  const isAdmin = currentUser.role === "MIS_ADMIN";

  // MIS side (builder / staff / admin): the build is delivered and it's the
  // requester's turn. This is a WAITING state — MIS never closes (§12.4). An admin
  // additionally gets an escape-hatch override, kept visually secondary so it doesn't
  // read as "you're being asked to test".
  if (!isRequester) {
    return (
      <div className="flex items-start gap-2.5 rounded-[var(--radius-input)] border border-border bg-surface-muted/60 p-3 text-sm">
        <Hourglass className="mt-0.5 size-4 shrink-0 text-text-muted" />
        <div className="min-w-0 flex-1">
          <p className="font-medium">
            Waiting for {request.createdByName ?? "the requester"} to test
          </p>
          <p className="mt-0.5 text-xs text-text-muted">
            The build is delivered. It closes when{" "}
            {request.createdByName ?? "the requester"} accepts it — MIS can&apos;t
            accept or close on their behalf.
          </p>
          {/* Admin-only ESCAPE HATCH (§12.4), deliberately secondary: use it only if
              the requester can't test it, since it reopens the build for another
              round. Not shown to non-admin staff, and never on the list. */}
          {isAdmin ? (
            <div className="mt-2.5 border-t border-border/60 pt-2.5">
              <p className="text-xs text-text-muted">
                Requester unavailable to test? As an admin you can send it back into the
                build queue.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-1.5 h-auto px-2 py-1 text-xs text-text-muted hover:text-foreground"
                disabled={pending}
                onClick={() => setAsking(true)}
              >
                <RotateCcw className="size-3.5" /> Send back for changes (override)
              </Button>
            </div>
          ) : null}
        </div>
        <ChangesDialog
          open={asking}
          pending={pending}
          ticketId={request.id}
          onOpenChange={setAsking}
          onDone={onMutate}
          startTransition={startTransition}
        />
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-input)] border border-primary/30 bg-accent-soft/50 p-4">
      <h2 className="font-display text-sm font-semibold">Ready for you to test</h2>
      <p className="mt-0.5 text-xs text-text-muted">
        {request.assignedToName ?? "MIS"} has finished a build for you to try. Accept it
        to close this request for good, or send it back with what needs changing —
        there&apos;s no limit on rounds.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await acceptRequest(request.id);
              if (!res.ok) {
                toast.error(res.error);
                return;
              }
              toast.success(`${request.number} accepted — closed for good`);
              onMutate?.();
            })
          }
        >
          <CheckCircle2 className="size-4" /> Accept &amp; close
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => setAsking(true)}>
          <RotateCcw className="size-4" /> Request changes
        </Button>
      </div>

      <ChangesDialog
        open={asking}
        pending={pending}
        ticketId={request.id}
        onOpenChange={setAsking}
        onDone={onMutate}
        startTransition={startTransition}
      />
    </div>
  );
}

function ChangesDialog({
  open,
  pending,
  ticketId,
  onOpenChange,
  onDone,
  startTransition,
}: {
  open: boolean;
  pending: boolean;
  ticketId: string;
  onOpenChange: (o: boolean) => void;
  onDone?: () => void;
  startTransition: (fn: () => void) => void;
}) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [uploading, setUploading] = useState(false);

  // Fresh form on every open — the wrapper stays mounted between opens.
  useEffect(() => {
    if (!open) return;
    setBody("");
    setAttachments([]);
  }, [open]);

  const submit = () => {
    if (!body.trim()) {
      toast.error("Describe what needs to change.");
      return;
    }
    if (uploading) {
      toast.error("Please wait for the uploads to finish.");
      return;
    }
    startTransition(async () => {
      const res = await requestChanges({ ticketId, body });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Hang the requester's files off the change-request comment itself (shared
      // P4 attachTo flow) so the evidence sits with the words.
      let failed = 0;
      if (attachments.length > 0) {
        const results = await Promise.allSettled(
          attachments.map((m) => attachTo(ticketId, res.data.commentId, m))
        );
        failed = results.filter((r) => r.status === "rejected" || !r.value.ok).length;
      }
      if (failed > 0) {
        toast.warning(
          `Sent back for changes (round ${res.data.round}), but ${failed} attachment(s) couldn't be saved.`
        );
      } else {
        toast.success(`Sent back for changes — round ${res.data.round}`);
      }
      onOpenChange(false);
      onDone?.();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request changes</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-text-muted">
          This goes back to the assignee as a new round. Your note is added to the
          conversation so the whole back-and-forth stays in one place.
        </p>
        <div>
          <label htmlFor="changes-body" className="mb-1 block text-sm font-medium">
            What needs to change?
          </label>
          <Textarea
            id="changes-body"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe what isn't right, ideally with the steps you tried."
            disabled={pending}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">
            Attachments <span className="font-normal text-text-muted">· optional</span>
          </label>
          <FileDropzone
            onChange={setAttachments}
            onBusyChange={setUploading}
            disabled={pending}
            compact
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || uploading || !body.trim()}>
            {pending ? "Sending…" : "Send back for changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
