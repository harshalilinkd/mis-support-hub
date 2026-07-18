"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import {
  acceptRequest,
  moveToReview,
  releaseRequest,
  resumeWork,
  reviveRequest,
  sendForApproval,
} from "@/lib/actions/requests";
import type { Status } from "@/lib/db/schema";
import {
  availableRequestMoves,
  type RequestMove,
  type RequestMoveContext,
  type RequestMoveId,
} from "@/lib/ticket-state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusChip } from "./chips";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

type ActionResult = { ok: boolean; error?: string };

/**
 * The inline (no-input) moves and their success copy — matching RequestActions'
 * wording so the toast reads the same whether you act from the row or the detail.
 * Data-carrying moves (claim / start / decision / complete / request-changes) are
 * deliberately absent: they open the detail, where the tested dialog collects the
 * priority / date / verdict / note. The list of *which* moves a viewer may make is
 * `availableRequestMoves` — the ONE predicate the detail bar shares (§12.4).
 */
const INLINE: Partial<
  Record<
    RequestMoveId,
    { run: (id: string) => Promise<ActionResult>; done: (number: string) => string }
  >
> = {
  review: { run: moveToReview, done: () => "Moved to review" },
  sendApproval: { run: sendForApproval, done: () => "Sent for approval" },
  revive: { run: reviveRequest, done: () => "Request revived" },
  release: {
    run: releaseRequest,
    done: () => "Released — it's back in the approved pool",
  },
  resume: { run: resumeWork, done: () => "Back in progress" },
  accept: { run: acceptRequest, done: (n) => `${n} accepted — closed for good` },
};

/**
 * Inline stage control for the requests list (the row-level answer to the issue
 * tables' StatusControl). Shows the stage chip; if the viewer has any legal move
 * from this stage it becomes a dropdown of exactly those moves. One-click moves run
 * in place; moves needing input open the request's detail to finish. Renders a plain
 * read-only chip when the viewer can't act — same as before.
 */
export function RequestStageControl({
  ticketId,
  number,
  status,
  ctx,
  onOpenDetail,
}: {
  ticketId: string;
  number: string;
  status: Status;
  ctx: RequestMoveContext;
  /** Open the request detail to complete a data-carrying move. */
  onOpenDetail: (number: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const moves = availableRequestMoves(status, ctx);

  // Nothing this viewer may do from here → read-only chip (unchanged behaviour).
  if (moves.length === 0) return <StatusChip status={status} />;

  function select(move: RequestMove) {
    if (move.kind === "detail") {
      onOpenDetail(number);
      return;
    }
    const entry = INLINE[move.id];
    if (!entry) return; // inline moves always have an entry; defensive only
    startTransition(async () => {
      const res = await entry.run(ticketId);
      if (!res.ok) {
        toast.error(res.error ?? "That move was rejected.");
        return;
      }
      toast.success(entry.done(number));
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          onClick={stop}
          aria-label={`Change stage of ${number}`}
          className="inline-flex items-center gap-1 rounded-[6px] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <StatusChip status={status} />
          <ChevronDown className="size-3 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      {/* Stop row-open on click/keys — the menu is self-contained (same as the
          issue StatusControl). */}
      <DropdownMenuContent align="start" onClick={stop}>
        {moves.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => select(m)}>
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
