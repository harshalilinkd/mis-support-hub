import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/authz";
import {
  getRequestByNumber,
  getTicketByNumber,
  listActiveGranteesRow,
  listAssignableUsers,
} from "@/lib/db/queries";
import { isStaff } from "@/lib/roles";
import { RequestDetail } from "@/components/tickets/request-detail";
import { TicketDetail } from "@/components/tickets/ticket-detail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ number: string }>;
}): Promise<Metadata> {
  const { number } = await params;
  return { title: number };
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  const user = await requireUser();
  const viewer = { id: user.id, role: user.role };

  // ISSUE (MIS-…) and REQUEST (REQ-…) share this route (CLAUDE.md §12, Hybrid) —
  // render the type-appropriate detail. Both queries enforce §6 visibility.
  const request = await getRequestByNumber(number, viewer);
  if (request) {
    // §13.5's log-a-system prompt needs an owner list and the grantee checklist.
    // Fetched only on the REQUEST branch, and only for someone who could actually
    // log it — an issue detail or a plain requester pays nothing for this.
    const canBuild =
      user.role === "MIS_ADMIN" ||
      (isStaff(user.role) && request.assignedToId === user.id);
    const [owners, grantees] = canBuild
      ? await Promise.all([listAssignableUsers(), listActiveGranteesRow()])
      : [[], []];
    return (
      <RequestDetail
        request={request}
        currentUser={user}
        owners={owners}
        grantees={grantees.map((g) => ({ id: g.id, label: g.label }))}
      />
    );
  }

  const ticket = await getTicketByNumber(number, viewer);
  if (!ticket) notFound();

  return <TicketDetail ticket={ticket} currentUser={user} />;
}
