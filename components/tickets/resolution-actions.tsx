"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { confirmResolved, reopenTicket } from "@/lib/actions/tickets";
import { Button } from "@/components/ui/button";

/**
 * Shown to the reporter (and MIS admins) while a ticket is RESOLVED.
 * "Confirm resolved" permanently CLOSES the ticket (§ workflow) — once closed
 * this prompt no longer renders and the ticket can't be reopened. "Reopen"
 * sends it back to the same MIS member as REOPENED.
 */
export function ResolutionActions({
  ticketId,
  showConfirm,
  onDone,
}: {
  ticketId: string;
  showConfirm: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

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
      onDone?.();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-border bg-accent-soft/40 p-3">
      <span className="text-sm font-medium">Did this resolve your issue?</span>
      <div className="ml-auto flex gap-2">
        {showConfirm ? (
          <Button
            size="sm"
            onClick={() =>
              run(
                () => confirmResolved(ticketId),
                "Thanks for confirming — the ticket is now closed."
              )
            }
            disabled={pending}
          >
            <CheckCircle2 className="size-4" />
            Confirm resolved
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          onClick={() => run(() => reopenTicket(ticketId), "Ticket reopened")}
          disabled={pending}
        >
          <RotateCcw className="size-4" />
          {pending ? "Working…" : "Reopen"}
        </Button>
      </div>
    </div>
  );
}
