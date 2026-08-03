"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckBig, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { reopenTicket } from "@/lib/actions/tickets";
import { reopenRequest } from "@/lib/actions/requests";
import { Button } from "@/components/ui/button";

/**
 * Shown when the SYSTEM auto-closed a ticket the reporter never acted on (§5). Explains
 * why it closed and offers a Reopen — because an auto-close is a convenience, not a
 * verdict, the reporter can still send it back if it wasn't actually resolved.
 *  - ISSUE   → reopenTicket (CLOSED → REOPENED, back to the assignee).
 *  - REQUEST → reopenRequest (CLOSED → IN_TESTING, back at the UAT gate).
 */
export function AutoClosedBanner({
  ticketId,
  kind,
  onDone,
}: {
  ticketId: string;
  kind: "ISSUE" | "REQUEST";
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const reopen = () =>
    startTransition(async () => {
      const res =
        kind === "REQUEST" ? await reopenRequest(ticketId) : await reopenTicket(ticketId);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(
        kind === "REQUEST" ? "Reopened — it's back for you to test." : "Ticket reopened."
      );
      router.refresh();
      onDone?.();
    });

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-surface-muted/60 p-3">
      <CircleCheckBig className="size-4 shrink-0 text-text-muted" />
      <span className="min-w-0 flex-1 text-sm">
        {kind === "REQUEST"
          ? "We closed this automatically — the build was delivered a while ago and no changes were requested, so we accepted it on your behalf."
          : "We closed this automatically — it was marked resolved a while ago and you didn't ask for changes, so we treated it as resolved."}{" "}
        <span className="text-text-muted">Not right? You can still reopen it.</span>
      </span>
      <Button
        size="sm"
        variant="outline"
        className="shrink-0"
        onClick={reopen}
        disabled={pending}
      >
        <RotateCcw className="size-4" /> {pending ? "Reopening…" : "Reopen"}
      </Button>
    </div>
  );
}
