"use client";

import { forwardRef, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { MessageSquare, Paperclip } from "lucide-react";

import { RelativeTime } from "@/components/relative-time";
import { PriorityChip } from "@/components/tickets/chips";
import { UserAvatar } from "@/components/user-avatar";
import type { BoardTicketRow } from "@/lib/db/queries";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { cn } from "@/lib/utils";

// Shared so the click-vs-drag open threshold can't drift from the PointerSensor
// activation distance (used in board-view.tsx).
export const DRAG_ACTIVATION_DISTANCE = 8;

/** Pure card visual — used for the in-column card, the drag overlay, and (with a
 * `children` footer) the mobile move control. */
export const BoardCardContent = forwardRef<
  HTMLDivElement,
  { ticket: BoardTicketRow } & React.HTMLAttributes<HTMLDivElement>
>(function BoardCardContent({ ticket, className, children, ...rest }, ref) {
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
        <span className="font-mono text-xs text-text-muted">
          {ticket.number}
        </span>
        <PriorityChip priority={ticket.priority} />
      </div>
      <p className="mt-1 line-clamp-2 text-sm font-medium">{ticket.title}</p>
      <div className="mt-2">
        <span className="rounded-[var(--radius-chip)] border border-border px-1.5 py-0.5 text-xs text-text-muted">
          {DEPARTMENT_LABELS[ticket.department]}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-text-muted">
        <div className="flex min-w-0 items-center gap-1.5">
          {ticket.assignedToId ? (
            <UserAvatar
              name={ticket.assignedToName}
              image={ticket.assignedToImage}
              className="size-5"
            />
          ) : null}
          <RelativeTime date={ticket.createdAt} />
        </div>
        <div className="flex items-center gap-2">
          {ticket.commentCount > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <MessageSquare className="size-3" />
              {ticket.commentCount}
            </span>
          ) : null}
          {ticket.attachmentCount > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <Paperclip className="size-3" />
              {ticket.attachmentCount}
            </span>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
});

/** Draggable card. Distinguishes a click (open Sheet) from a drag by movement. */
export function BoardCard({
  ticket,
  onOpen,
}: {
  ticket: BoardTicketRow;
  onOpen: () => void;
}) {
  // Terminal tickets (resolved/closed) sit in the Resolved column but can't move
  // anywhere via the state machine, so make them non-draggable (still clickable).
  const draggable = ticket.status !== "RESOLVED" && ticket.status !== "CLOSED";
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: ticket.id, disabled: !draggable });
  const downPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <BoardCardContent
      ticket={ticket}
      ref={setNodeRef}
      style={transform ? { transform: CSS.Translate.toString(transform) } : undefined}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
        listeners?.onPointerDown?.(e);
      }}
      onClick={(e) => {
        // dnd-kit already suppresses the click after an activated drag, so any
        // click here means no drag started (movement < activation distance).
        const d = downPos.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_ACTIVATION_DISTANCE) {
          onOpen();
        }
      }}
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        draggable ? "cursor-grab" : "cursor-pointer",
        isDragging && "opacity-40"
      )}
    />
  );
}
