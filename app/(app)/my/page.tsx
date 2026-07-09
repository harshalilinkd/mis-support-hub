import type { Metadata } from "next";

import { requireUser } from "@/lib/authz";
import { listMyTickets } from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { MyTicketsView } from "@/components/tickets/my-tickets-view";

export const metadata: Metadata = { title: "My Tickets" };

export default async function MyTicketsPage() {
  const user = await requireUser();
  const rows = await listMyTickets(user.id);

  const tickets = rows.map((r) => ({
    number: r.number,
    title: r.title,
    department: r.department,
    status: r.status,
    priority: r.priority,
    updatedAt: toIso(r.updatedAt),
    assignedToName: r.assignedToName,
    commentCount: r.commentCount,
  }));

  return (
    <div>
      <PageHeader
        title="My Tickets"
        description="Tickets you've raised, most recent first."
      />
      <MyTicketsView tickets={tickets} />
    </div>
  );
}
