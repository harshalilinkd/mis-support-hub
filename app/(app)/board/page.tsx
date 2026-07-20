import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import { listBoardTickets } from "@/lib/db/queries";
import { BoardView } from "@/components/board/board-view";
import { ScopeToggle } from "@/components/dashboard/scope-toggle";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Issue Board" };

export default async function BoardPage() {
  const user = await requireRole(...STAFF_ROLES);
  // Every ticket shows on the board; RESOLVED + CLOSED both live in the Resolved
  // column (matches the All Tickets "Resolved" tab).
  const tickets = await listBoardTickets();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Issue Board"
        description="Drag issues across the workflow — Open → In Progress → Resolved."
      >
        <div className="flex flex-wrap items-center gap-2">
          <ScopeToggle />
          <ViewToggle />
        </div>
      </PageHeader>
      <BoardView tickets={tickets} currentUser={user} />
    </div>
  );
}
