"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { KanbanSquare } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/shell/empty-state";
import { updateStatus } from "@/lib/actions/tickets";
import type { BoardTicketRow } from "@/lib/db/queries";
import type { Status } from "@/lib/db/schema";
import { humanizeEnum } from "@/lib/format";
import type { SessionUser } from "@/lib/session";
import { canResolveIssue, canTransition } from "@/lib/ticket-state";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { ClaimDialog } from "@/components/tickets/claim-dialog";
import { ResolveDialog } from "@/components/tickets/resolve-dialog";
import { StartTaskDialog } from "@/components/tickets/start-task-dialog";
import { TicketSheet } from "@/components/tickets/ticket-sheet";
import {
  BoardCard,
  BoardCardContent,
  DRAG_ACTIVATION_DISTANCE,
} from "./board-card";
import { BoardColumn } from "./board-column";
import { BoardMoveControl } from "./board-move-control";

type ColId = "OPEN" | "IN_PROGRESS" | "RESOLVED";

const COLUMNS: { id: ColId; label: string; target: Status }[] = [
  { id: "OPEN", label: "Open", target: "OPEN" },
  { id: "IN_PROGRESS", label: "In Progress", target: "IN_PROGRESS" },
  { id: "RESOLVED", label: "Resolved", target: "RESOLVED" },
];

function columnFor(status: Status): ColId {
  if (status === "OPEN") return "OPEN";
  if (status === "IN_PROGRESS" || status === "REOPENED") return "IN_PROGRESS";
  // RESOLVED + CLOSED both live in the Resolved column.
  return "RESOLVED";
}

function group(tickets: BoardTicketRow[]): Record<ColId, BoardTicketRow[]> {
  const cols: Record<ColId, BoardTicketRow[]> = {
    OPEN: [],
    IN_PROGRESS: [],
    RESOLVED: [],
  };
  for (const t of tickets) {
    cols[columnFor(t.status)].push(t);
  }
  return cols;
}

export function BoardView({
  tickets,
  currentUser,
}: {
  tickets: BoardTicketRow[];
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const [columns, setColumns] = useState(() => group(tickets));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [claimTarget, setClaimTarget] = useState<string | null>(null);
  const [startTarget, setStartTarget] = useState<string | null>(null);
  const [resolveTarget, setResolveTarget] = useState<string | null>(null);

  // Re-sync to server truth when the underlying data changes (after refresh).
  const signature = tickets.map((t) => `${t.id}:${t.status}`).join(",");
  useEffect(() => {
    setColumns(group(tickets));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: DRAG_ACTIVATION_DISTANCE },
    }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const cardById = useMemo(() => {
    const map = new Map<string, BoardTicketRow>();
    for (const list of Object.values(columns)) {
      for (const t of list) map.set(t.id, t);
    }
    return map;
  }, [columns]);

  function findColumn(ticketId: string): ColId | null {
    for (const col of COLUMNS) {
      if (columns[col.id].some((t) => t.id === ticketId)) return col.id;
    }
    return null;
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const ticketId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;

    const targetCol = COLUMNS.find((c) => c.id === overId);
    const sourceCol = findColumn(ticketId);
    const card = cardById.get(ticketId);
    if (!targetCol || !sourceCol || !card || sourceCol === targetCol.id) return;

    // Ownership lock (§6): only the assignee moves a claimed ticket. Unassigned
    // tickets (assignedToId null) fall through — dropping one into In Progress
    // claims it below.
    if (card.assignedToId && card.assignedToId !== currentUser.id) {
      toast.error("This ticket is claimed by someone else — only they can move it.");
      return;
    }

    // Open → In Progress = start work (§5). If it's already mine (claimed), just
    // ask for a deadline (Start task). If it's unassigned, this is the combined
    // "claim & start" shortcut (priority + deadline). Never a bare status change.
    if (sourceCol === "OPEN" && targetCol.id === "IN_PROGRESS") {
      if (card.assignedToId === currentUser.id) setStartTarget(ticketId);
      else setClaimTarget(ticketId);
      return;
    }

    const to = targetCol.target;

    // Respect the state machine (§5) — block illegal drops client-side.
    if (!canTransition(card.status, to)) {
      toast.error(
        `Can't move ${humanizeEnum(card.status)} → ${humanizeEnum(to)}.`
      );
      return;
    }
    if (to === "RESOLVED" && !card.assignedToId) {
      toast.error("Assign the ticket before resolving it.");
      return;
    }
    // Resolving is admin + assignee (§6) — refuse the drop rather than opening a dialog
    // whose submit the server would reject.
    if (
      to === "RESOLVED" &&
      !canResolveIssue(currentUser.role, card.assignedToId === currentUser.id)
    ) {
      toast.error("Only an MIS admin can mark a ticket resolved.");
      return;
    }

    // Resolving needs the DAY the work finished (§5), so a drop opens the same dialog
    // the detail uses rather than silently stamping "now" — a drag can't supply a date.
    // No optimistic move: the card snaps back until the dialog commits, exactly like
    // the Open → In Progress drop above.
    if (to === "RESOLVED") {
      setResolveTarget(ticketId);
      return;
    }

    // Optimistic move.
    const previous = columns;
    setColumns((cols) => {
      const next: Record<ColId, BoardTicketRow[]> = {
        OPEN: [...cols.OPEN],
        IN_PROGRESS: [...cols.IN_PROGRESS],
        RESOLVED: [...cols.RESOLVED],
      };
      next[sourceCol] = next[sourceCol].filter((t) => t.id !== ticketId);
      next[targetCol.id] = [{ ...card, status: to }, ...next[targetCol.id]];
      return next;
    });

    void (async () => {
      const res = await updateStatus(ticketId, to);
      if (!res.ok) {
        setColumns(previous); // revert
        toast.error(res.error);
        return;
      }
      toast.success(`Moved ${card.number} to ${targetCol.label}`);
      router.refresh();
    })();
  }

  const activeCard = activeId ? cardById.get(activeId) : null;
  const total =
    columns.OPEN.length + columns.IN_PROGRESS.length + columns.RESOLVED.length;

  return (
    <>
      {total === 0 ? (
        <EmptyState
          icon={<KanbanSquare className="size-5" />}
          title="No active tickets"
          description="Open, in-progress, and resolved tickets show up here as a board."
          seed={3}
        />
      ) : (
      <>
        {/* Mobile (< sm): the columns stack vertically (Open → In Progress →
            Resolved), so there's no sideways scrolling. Dragging is unreliable on
            touch, so each card carries a "Move" control that runs the same claim /
            status-change flow. Tap the card body to open the full detail. */}
        <div className="space-y-5 sm:hidden">
          {COLUMNS.map((col) => (
            <section key={col.id}>
              <div className="mb-2 flex items-center justify-between px-0.5">
                <span className="text-sm font-semibold">{col.label}</span>
                <span className="font-mono text-xs tabular-nums text-text-muted">
                  {columns[col.id].length}
                </span>
              </div>
              {columns[col.id].length === 0 ? (
                <div className="rounded-[var(--radius-input)] border border-dashed border-border p-4 text-center text-xs text-text-muted">
                  Nothing here
                </div>
              ) : (
                <div className="space-y-2">
                  {columns[col.id].map((t) => (
                    <BoardCardContent
                      key={t.id}
                      ticket={t}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open ${t.number}: ${t.title}`}
                      onClick={() => setSelected(t.number)}
                      onKeyDown={(e) => {
                        // Only when the card itself is focused — not when the
                        // keystroke bubbles up from the Move button.
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelected(t.number);
                        }
                      }}
                      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    >
                      <div
                        className="mt-3 border-t border-border pt-2.5"
                        // The move button is interactive — its taps must not also
                        // open the detail sheet.
                        onClick={(e) => e.stopPropagation()}
                      >
                        <BoardMoveControl ticket={t} currentUser={currentUser} />
                      </div>
                    </BoardCardContent>
                  ))}
                </div>
              )}
            </section>
          ))}
        </div>

        {/* Desktop (sm+): the drag-and-drop board. */}
        <div className="hidden sm:block">
          <DndContext
            sensors={sensors}
            collisionDetection={pointerWithin}
            onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
            onDragCancel={() => setActiveId(null)}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-3 gap-4">
              {COLUMNS.map((col) => (
                <BoardColumn
                  key={col.id}
                  id={col.id}
                  label={col.label}
                  count={columns[col.id].length}
                >
                  {columns[col.id].map((t) => (
                    <BoardCard
                      key={t.id}
                      ticket={t}
                      onOpen={() => setSelected(t.number)}
                    />
                  ))}
                </BoardColumn>
              ))}
            </div>
            <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
              {activeCard ? (
                <BoardCardContent
                  ticket={activeCard}
                  className={cn(
                    "cursor-grabbing",
                    !reducedMotion && "rotate-2 shadow-[var(--shadow-popover)]"
                  )}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </>
      )}

      {/* Unassigned card dragged to In Progress: combined claim & start. */}
      <ClaimDialog
        ticketId={claimTarget}
        open={!!claimTarget}
        onOpenChange={(o) => {
          if (!o) setClaimTarget(null);
        }}
        onDone={() => {
          setClaimTarget(null);
          router.refresh();
        }}
        withStart
      />

      {/* My already-claimed card dragged to In Progress: just set a deadline. */}
      <StartTaskDialog
        ticketId={startTarget}
        open={!!startTarget}
        onOpenChange={(o) => {
          if (!o) setStartTarget(null);
        }}
        onDone={() => {
          setStartTarget(null);
          router.refresh();
        }}
      />

      {/* Card dragged to Resolved: record the day the work actually finished. */}
      <ResolveDialog
        ticketId={resolveTarget}
        ticketNumber={
          resolveTarget ? cardById.get(resolveTarget)?.number : undefined
        }
        createdAt={
          resolveTarget ? cardById.get(resolveTarget)?.createdAt : undefined
        }
        open={!!resolveTarget}
        onOpenChange={(o) => {
          if (!o) setResolveTarget(null);
        }}
        onDone={() => {
          setResolveTarget(null);
          router.refresh();
        }}
      />

      <TicketSheet
        number={selected}
        currentUser={currentUser}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
    </>
  );
}
