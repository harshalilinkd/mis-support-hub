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
import type { TicketListRow } from "@/lib/db/queries";
import type { Status } from "@/lib/db/schema";
import { humanizeEnum } from "@/lib/format";
import type { SessionUser } from "@/lib/session";
import { canTransition } from "@/lib/ticket-state";
import { usePrefersReducedMotion } from "@/lib/use-reduced-motion";
import { cn } from "@/lib/utils";
import { ClaimDialog } from "@/components/tickets/claim-dialog";
import { TicketSheet } from "@/components/tickets/ticket-sheet";
import {
  BoardCard,
  BoardCardContent,
  DRAG_ACTIVATION_DISTANCE,
} from "./board-card";
import { BoardColumn } from "./board-column";

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

function group(tickets: TicketListRow[]): Record<ColId, TicketListRow[]> {
  const cols: Record<ColId, TicketListRow[]> = {
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
  tickets: TicketListRow[];
  currentUser: SessionUser;
}) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();
  const [columns, setColumns] = useState(() => group(tickets));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [claimTarget, setClaimTarget] = useState<string | null>(null);

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
    const map = new Map<string, TicketListRow>();
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

    // Open → In Progress = claim: open the priority/deadline dialog, which
    // assigns the ticket to the current member (not a bare status change).
    if (sourceCol === "OPEN" && targetCol.id === "IN_PROGRESS") {
      setClaimTarget(ticketId);
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

    // Optimistic move.
    const previous = columns;
    setColumns((cols) => {
      const next: Record<ColId, TicketListRow[]> = {
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
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={handleDragEnd}
      >
        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scroll-padding-left:1rem] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:[scroll-padding-left:0]">
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
      )}

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
