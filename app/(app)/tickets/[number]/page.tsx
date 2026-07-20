import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

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
  // The back-link follows the PIPELINE, not just the role. This route is shared by
  // both types (§12.7), so a fixed "/tickets" sent someone viewing REQ-005 "back" to
  // the issue list — a list that does not contain it. Defaults are the ISSUE ones;
  // the REQUEST branch below overrides them. Labels mirror the sidebar exactly
  // (`sectionsFor` swaps "All Requests" → "My Requests" for a USER).
  let backUrl = isStaff(user.role) ? "/tickets" : "/my";
  let backLabel = isStaff(user.role) ? "All Issues" : "My Tickets";

  let content: React.ReactNode;

  // ISSUE (MIS-…) and REQUEST (REQ-…) share this route (CLAUDE.md §12, Hybrid) —
  // render the type-appropriate detail. Both queries enforce §6 visibility.
  const request = await getRequestByNumber(number, viewer);
  if (request) {
    backUrl = "/requests";
    backLabel = isStaff(user.role) ? "All Requests" : "My Requests";
    // §13.5's log-a-system prompt needs an owner list and the grantee checklist.
    // Fetched only on the REQUEST branch, and only for someone who could actually
    // log it — an issue detail or a plain requester pays nothing for this.
    const canBuild =
      user.role === "MIS_ADMIN" ||
      (isStaff(user.role) && request.assignedToId === user.id);
    const [owners, grantees] = canBuild
      ? await Promise.all([listAssignableUsers(), listActiveGranteesRow()])
      : [[], []];
    content = (
      <RequestDetail
        request={request}
        currentUser={user}
        owners={owners}
        grantees={grantees.map((g) => ({ id: g.id, label: g.label }))}
      />
    );
  } else {
    const ticket = await getTicketByNumber(number, viewer);
    if (!ticket) notFound();
    content = <TicketDetail ticket={ticket} currentUser={user} />;
  }

  return (
    <div className="space-y-3">
      <Link
        href={backUrl}
        className="inline-flex items-center gap-1 rounded-[6px] text-sm font-medium text-text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" />
        {backLabel}
      </Link>
      {content}
    </div>
  );
}
