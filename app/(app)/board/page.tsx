import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import { listAllTickets } from "@/lib/db/queries";
import { BoardView } from "@/components/board/board-view";
import { ViewToggle } from "@/components/dashboard/view-toggle";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Board" };

export default async function BoardPage() {
  const user = await requireRole(...STAFF_ROLES);
  const all = await listAllTickets();
  // The board shows active + resolved work; CLOSED tickets drop off.
  const tickets = all.filter((t) => t.status !== "CLOSED");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Board"
        description="Drag tickets across the workflow — Open → In Progress → Resolved."
      >
        <ViewToggle />
      </PageHeader>
      <BoardView tickets={tickets} currentUser={user} />
    </div>
  );
}
