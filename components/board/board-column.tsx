"use client";

import { useDroppable } from "@dnd-kit/core";

import { cn } from "@/lib/utils";

export function BoardColumn({
  id,
  label,
  count,
  children,
}: {
  id: string;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex w-[85vw] max-w-[20rem] shrink-0 snap-start flex-col sm:w-auto sm:max-w-none">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-xs tabular-nums text-text-muted">
          {count}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "min-h-40 flex-1 space-y-2 rounded-[var(--radius-card)] border p-2 transition-colors",
          isOver
            ? "border-primary bg-accent-soft/40"
            : "border-border bg-surface-muted/40"
        )}
      >
        {children}
        {count === 0 ? (
          <div className="rounded-[var(--radius-input)] border border-dashed border-border p-6 text-center text-xs text-text-muted">
            Nothing here
          </div>
        ) : null}
      </div>
    </div>
  );
}
