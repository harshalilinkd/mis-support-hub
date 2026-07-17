import type { Metadata } from "next";

import { requireUser } from "@/lib/authz";
import { listAssignedToMe, listMyTickets, listRequests } from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { MyTicketsView } from "@/components/tickets/my-tickets-view";
import { MyWorkView } from "@/components/tickets/my-work-view";

export const metadata: Metadata = { title: "My Tickets" };

export default async function MyTicketsPage() {
  const user = await requireUser();
  const isStaff = user.role === "MIS_STAFF" || user.role === "MIS_ADMIN";
  // Employees see the tickets they raised; MIS staff see their work queue —
  // the tickets currently assigned to them (what they're actively working on).
  const rows = isStaff
    ? await listAssignedToMe(user.id)
    : await listMyTickets(user.id);
  // A claimed system request is that member's work too (§12.3) — it belongs in the
  // same place as their tickets, in its own section.
  const myRequests = isStaff
    ? await listRequests({ id: user.id, role: user.role }, { assignedTo: user.id })
    : [];

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
            ? "Your work — issue tickets and the system requests you're building."
            : "Tickets you've raised, most recent first."
        }
      />
      {isStaff ? (
        <MyWorkView tickets={tickets} requests={myRequests} currentUser={user} />
      ) : (
        <MyTicketsView tickets={tickets} variant="raised" currentUser={user} />
      )}
    </div>
  );
}
