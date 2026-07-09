import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Board" };

const COLUMNS = ["Open", "In Progress", "Resolved", "Closed"] as const;

export default async function BoardPage() {
  await requireRole(...STAFF_ROLES);

  return (
    <div>
      <PageHeader
        title="Board"
        description="The drag-and-drop Kanban (dnd-kit) is built in a later phase."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((column) => (
          <div
            key={column}
            className="rounded-[var(--radius-card)] border border-border bg-surface-muted p-3"
          >
            <div className="mb-2 px-1 text-sm font-medium">{column}</div>
            <div className="rounded-[var(--radius-input)] border border-dashed border-border p-6 text-center text-xs text-text-muted">
              Empty
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
