import type { Metadata } from "next";

import { requireUser } from "@/lib/authz";
import { listAssignedToMe, listMyTickets } from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { MyTicketsView } from "@/components/tickets/my-tickets-view";

export const metadata: Metadata = { title: "My Tickets" };

export default async function MyTicketsPage() {
  const user = await requireUser();
  const isStaff = user.role === "MIS_STAFF" || user.role === "MIS_ADMIN";
  // Employees see the tickets they raised; MIS staff see their work queue —
  // the tickets currently assigned to them (what they're actively working on).
  const rows = isStaff
    ? await listAssignedToMe(user.id)
    : await listMyTickets(user.id);

  const tickets = rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    department: r.department,
    status: r.status,
    priority: r.priority,
    deadline: r.deadline ? toIso(r.deadline) : null,
    updatedAt: toIso(r.updatedAt),
    assignedToName: r.assignedToName,
    commentCount: r.commentCount,
    sheetLink: r.sheetLink,
    attachments: r.attachments,
  }));

  return (
    <div>
      <PageHeader
        title={isStaff ? "Assigned to Me" : "My Tickets"}
        description={
          isStaff
            ? "Tickets assigned to you, grouped by status — active work and your closed history."
            : "Tickets you've raised, most recent first."
        }
      />
      <MyTicketsView
        tickets={tickets}
        variant={isStaff ? "assigned" : "raised"}
        currentUser={user}
      />
    </div>
  );
}
