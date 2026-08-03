import type { Metadata } from "next";

import { requireUser } from "@/lib/authz";
import { listAssignedToMe, listMyTickets, listRequests } from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import type { TicketTabKey } from "@/lib/ticket-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { MyWorkView } from "@/components/tickets/my-work-view";

export const metadata: Metadata = { title: "My Tickets" };

const TAB_KEYS = ["open", "in_progress", "resolved", "closed"] as const;

export default async function MyTicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  // Deep-link from the dashboard KPI cards: which sub-tab + status to open on.
  const scope = pick(sp.scope);
  const initialSection =
    scope === "systems" ? "systems" : scope === "issues" ? "tickets" : undefined;
  const tabParam = pick(sp.tab);
  const initialTab = (TAB_KEYS as readonly string[]).includes(tabParam ?? "")
    ? (tabParam as TicketTabKey)
    : undefined;

  const user = await requireUser();
  const isStaff = user.role === "MIS_STAFF" || user.role === "MIS_ADMIN";
  // Employees see the tickets they raised; MIS staff see their work queue —
  // the tickets currently assigned to them (what they're actively working on).
  const rows = isStaff
    ? await listAssignedToMe(user.id)
    : await listMyTickets(user.id);
  // BOTH audiences get their requests here, so /my is one home for everything the
  // viewer is involved with — not just issues:
  //  • staff  → requests they're BUILDING (assigned to them, §12.3)
  //  • USER   → requests they SUBMITTED (listRequests row-scopes a USER to their own,
  //             §12.7), so it mirrors the issues-they-raised list beside it.
  // Employees kept losing their requests because /my only listed issues; the combined
  // MyWorkView (Issues | System Requests sub-tabs) is that missing surface.
  const myRequests = isStaff
    ? await listRequests({ id: user.id, role: user.role }, { assignedTo: user.id })
    : await listRequests({ id: user.id, role: user.role });

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
            : "Everything you've raised — issues you reported and system requests you submitted."
        }
      />
      {/* Both roles use the combined view (Issues | System Requests sub-tabs). The
          only difference is the ticket sub-view's variant: staff are working tickets
          ASSIGNED to them (inline status/priority controls); a USER is looking at
          tickets they RAISED (read-only chips, assignee column). */}
      <MyWorkView
        tickets={tickets}
        requests={myRequests}
        currentUser={user}
        variant={isStaff ? "assigned" : "raised"}
        initialSection={initialSection}
        initialTab={initialTab}
      />
    </div>
  );
}
