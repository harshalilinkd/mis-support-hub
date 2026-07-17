"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  acceptRequest,
  markComplete,
  moveToReview,
  recordApprovalDecision,
  reviveRequest,
  sendForApproval,
} from "@/lib/actions/requests";
import type { RequestListRow } from "@/lib/db/queries";
import type { Role, Status } from "@/lib/db/schema";
import { humanizeEnum } from "@/lib/format";
import { isStaff } from "@/lib/roles";
import type { SessionUser } from "@/lib/session";
import { canTransition, transitionsFor } from "@/lib/ticket-state";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
import { EmptyState } from "@/components/shell/empty-state";
import { BoardColumn } from "@/components/board/board-column";
import { DRAG_ACTIVATION_DISTANCE } from "@/components/board/board-card";
import { RequestSheet } from "./request-sheet";

type ColId =
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "PENDING_MD_APPROVAL"
  | "APPROVED"
  | "IN_PROGRESS"
  | "IN_TESTING"
  | "CLOSED";

/**
 * The REQUEST pipeline (§12.3). `holds` folds the two "waiting" states into the
 * stage they belong to: a CLAIMED build hasn't started (Approved), and a
 * CHANGES_REQUESTED one is back in the build loop (In progress). `target` is the
 * status a drop onto that column means.
 */
const COLUMNS: { id: ColId; label: string; target: Status; holds: Status[] }[] = [
  { id: "SUBMITTED", label: "Submitted", target: "SUBMITTED", holds: ["SUBMITTED"] },
  { id: "UNDER_REVIEW", label: "Under review", target: "UNDER_REVIEW", holds: ["UNDER_REVIEW"] },
  { id: "PENDING_MD_APPROVAL", label: "Awaiting approval", target: "PENDING_MD_APPROVAL", holds: ["PENDING_MD_APPROVAL"] },
  { id: "APPROVED", label: "Approved", target: "APPROVED", holds: ["APPROVED", "CLAIMED"] },
  { id: "IN_PROGRESS", label: "In progress", target: "IN_PROGRESS", holds: ["IN_PROGRESS", "CHANGES_REQUESTED"] },
  { id: "IN_TESTING", label: "Testing", target: "IN_TESTING", holds: ["IN_TESTING"] },
  { id: "CLOSED", label: "Closed", target: "CLOSED", holds: ["CLOSED"] },
];
const DROPPED_LANE = "DROPPED";

function columnFor(status: Status): ColId | typeof DROPPED_LANE {
  if (status === "DROPPED") return DROPPED_LANE;
  return COLUMNS.find((c) => c.holds.includes(status))?.id ?? "SUBMITTED";
}

/** Why a drop was refused — topology first, then the §12.4 permission rule. */
function blockReason(
  from: Status,
  to: Status,
  role: Role,
  isRequester: boolean
): string {
  const legalShape = transitionsFor("REQUEST", from).includes(to);
  if (!legalShape) {
    // The most-attempted illegal move deserves a real explanation.
    if (from === "APPROVED" && to === "IN_PROGRESS") {
      return "Claim it first — a build needs a priority and a delivery date.";
    }
    return `Can't move a request from ${humanizeEnum(from)} to ${humanizeEnum(to)}.`;
  }
  // Shape is fine, so the actor isn't allowed (§12.4).
  if (to === "CLOSED") return "Only the requester can accept and close this request.";
  if (to === "APPROVED" || (to === "DROPPED" && from === "PENDING_MD_APPROVAL")) {
    return "Only an MIS admin can record the approval decision.";
  }
  if (to === "UNDER_REVIEW" && from === "DROPPED") {
    return "Only an MIS admin can revive a dropped request.";
  }
  if (to === "IN_PROGRESS") return "Only the assignee can work on this build.";
  if (to === "CHANGES_REQUESTED" && !isRequester) {
    return "Only the requester can send a build back for changes.";
  }
  if (!isStaff(role)) return "Only MIS staff can move a request through review.";
  return `You can't move ${humanizeEnum(from)} → ${humanizeEnum(to)}.`;
}

const isOverdue = (r: RequestListRow) =>
  !!r.deadline &&
  new Date(r.deadline).getTime() < Date.now() &&
  ["CLAIMED", "IN_PROGRESS", "IN_TESTING", "CHANGES_REQUESTED"].includes(r.status);

const DUE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
});

/* ---------------- card ---------------- */

const RequestCardContent = forwardRef<
  HTMLDivElement,
  { request: RequestListRow } & React.HTMLAttributes<HTMLDivElement>
>(function RequestCardContent({ request: r, className, children, ...rest }, ref) {
  const overdue = isOverdue(r);
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-[var(--radius-input)] border border-border bg-surface p-3 text-left shadow-[var(--shadow-elevation)]",
        className
      )}
      {...rest}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-text-muted">{r.number}</span>
        {r.revisionRound > 0 ? (
          <span
            title={`Sent back ${r.revisionRound} time(s)`}
            className="rounded-[var(--radius-chip)] px-1.5 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: "color-mix(in srgb, var(--priority-high) 14%, transparent)",
              color: "var(--priority-high)",
            }}
          >
            Round {r.revisionRound + 1}
          </span>
        ) : null}
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium">{r.systemName}</p>

      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-text-muted">
          {r.createdByName ?? "—"}
        </span>
        {r.assignedToId ? (
          <UserAvatar name={r.assignedToName} image={r.assignedToImage} />
        ) : null}
      </div>

      {r.percentComplete != null ? (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-[var(--status-in-progress)]"
              style={{ width: `${r.percentComplete}%` }}
            />
          </div>
          <span className="mt-0.5 block text-right font-mono text-[10px] tabular-nums text-text-muted">
            {r.percentComplete}%
          </span>
        </div>
      ) : null}

      {r.deadline ? (
        <p
          className={cn(
            "mt-2 font-mono text-[11px] tabular-nums",
            overdue ? "font-semibold text-destructive" : "text-text-muted"
          )}
        >
          {overdue ? "Overdue · " : "Due "}
          {DUE_FMT.format(new Date(r.deadline))}
        </p>
      ) : null}
      {children}
    </div>
  );
});

function DraggableCard({
  request: r,
  onOpen,
}: {
  request: RequestListRow;
  onOpen: (n: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: r.id,
  });
  return (
    <RequestCardContent
      ref={setNodeRef}
      request={r}
      // role/tabIndex come from dnd-kit's `attributes` spread below.
      aria-label={`Open ${r.number}: ${r.systemName}`}
      onClick={() => onOpen(r.number)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(r.number);
        }
      }}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
      {...listeners}
      {...attributes}
    />
  );
}

/* ---------------- board ---------------- */

export function RequestBoardView({
  requests,
  currentUser,
}: {
  requests: RequestListRow[];
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(requests);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showDropped, setShowDropped] = useState(false);

  // Server data wins after any revalidation.
  useEffect(() => setRows(requests), [requests]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor)
  );

  const grouped = useMemo(() => {
    const cols = Object.fromEntries(COLUMNS.map((c) => [c.id, [] as RequestListRow[]])) as Record<
      ColId,
      RequestListRow[]
    >;
    const dropped: RequestListRow[] = [];
    for (const r of rows) {
      const col = columnFor(r.status);
      if (col === DROPPED_LANE) dropped.push(r);
      else cols[col].push(r);
    }
    return { cols, dropped };
  }, [rows]);

  const active = activeId ? rows.find((r) => r.id === activeId) ?? null : null;

  async function runMove(r: RequestListRow, to: Status) {
    const isRequester = r.createdById === currentUser.id;
    const isAssignee = r.assignedToId === currentUser.id;

    // The SAME gate the server uses — the UI never offers an illegal move (§12.8).
    if (
      !canTransition("REQUEST", r.status, to, currentUser.role, isRequester, isAssignee)
    ) {
      toast.error(blockReason(r.status, to, currentUser.role, isRequester));
      return;
    }

    const run = (): Promise<{ ok: boolean; error?: string }> => {
      if (to === "UNDER_REVIEW") {
        return r.status === "DROPPED" ? reviveRequest(r.id) : moveToReview(r.id);
      }
      if (to === "PENDING_MD_APPROVAL") return sendForApproval(r.id);
      if (to === "APPROVED") {
        return recordApprovalDecision({ ticketId: r.id, decision: "APPROVED" });
      }
      if (to === "DROPPED") {
        return recordApprovalDecision({ ticketId: r.id, decision: "REJECTED" });
      }
      if (to === "IN_PROGRESS") {
        // Every way into this column goes through the detail. STARTING needs a
        // delivery date a drag can't supply; RESUMING can't arrive here at all,
        // because a CHANGES_REQUESTED card already sits in this column and the
        // same-column guard above stops it — "Back in progress" on the detail
        // does that job.
        return Promise.resolve({
          ok: false as const,
          error: "Open the request to start the build — you need to set a delivery date.",
        });
      }
      if (to === "IN_TESTING") return markComplete({ ticketId: r.id });
      if (to === "CLOSED") return acceptRequest(r.id);
      return Promise.resolve({ ok: false, error: "Unsupported move." });
    };

    // Optimistic (the one place we do it, matching the issue board).
    const prev = rows;
    setRows((rs) => rs.map((x) => (x.id === r.id ? { ...x, status: to } : x)));
    const res = await run();
    if (!res.ok) {
      setRows(prev);
      toast.error(res.error ?? "That move was rejected.");
      return;
    }
    toast.success(`${r.number} → ${humanizeEnum(to)}`);
    router.refresh();
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const overId = e.over?.id as string | undefined;
    if (!overId) return;
    const r = rows.find((x) => x.id === e.active.id);
    if (!r) return;
    const to =
      overId === DROPPED_LANE
        ? ("DROPPED" as Status)
        : COLUMNS.find((c) => c.id === overId)?.target;
    // "Did it actually move?" is a COLUMN question, not a status one. Two columns
    // hold two statuses each (Approved holds CLAIMED, In progress holds
    // CHANGES_REQUESTED), so comparing statuses let a drop onto the card's OWN
    // column pass this guard and fire a real transition while the card never moved.
    if (!to || columnFor(r.status) === overId) return;
    void runMove(r, to);
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="size-5" />}
        title="No requests yet"
        description="Once a system request is submitted it'll move across this board."
        actionHref="/requests/new"
        actionLabel="Request a system"
      />
    );
  }

  return (
    <div className="space-y-4">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => setActiveId(e.active.id as string)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={onDragEnd}
      >
        <div className="flex snap-x gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-7 lg:overflow-visible">
          {COLUMNS.map((c) => (
            <BoardColumn
              key={c.id}
              id={c.id}
              label={c.label}
              count={grouped.cols[c.id].length}
            >
              {grouped.cols[c.id].map((r) => (
                <DraggableCard key={r.id} request={r} onOpen={setSelected} />
              ))}
            </BoardColumn>
          ))}
        </div>

        {/* Dropped — collapsed by default; it's the dead-end lane, not the workflow. */}
        <div className="rounded-[var(--radius-card)] border border-border">
          <button
            type="button"
            aria-expanded={showDropped}
            onClick={() => setShowDropped((s) => !s)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-muted/60"
          >
            <span className="font-medium">Dropped</span>
            <span className="font-mono text-xs tabular-nums text-text-muted">
              {grouped.dropped.length}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto size-4 text-text-muted transition-transform",
                showDropped && "rotate-180"
              )}
            />
          </button>
          {showDropped ? (
            <div className="border-t border-border p-2">
              <BoardColumn id={DROPPED_LANE} label="Dropped" count={grouped.dropped.length}>
                {grouped.dropped.map((r) => (
                  <DraggableCard key={r.id} request={r} onOpen={setSelected} />
                ))}
              </BoardColumn>
            </div>
          ) : null}
        </div>

        <DragOverlay dropAnimation={null}>
          {active ? (
            <RequestCardContent request={active} className="shadow-[var(--shadow-hover)]" />
          ) : null}
        </DragOverlay>
      </DndContext>

      <RequestSheet
        number={selected}
        currentUser={currentUser}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}
