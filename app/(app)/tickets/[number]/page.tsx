import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/authz";
import { getRequestByNumber, getTicketByNumber } from "@/lib/db/queries";
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
  if (request) return <RequestDetail request={request} currentUser={user} />;

  const ticket = await getTicketByNumber(number, viewer);
  if (!ticket) notFound();

  return <TicketDetail ticket={ticket} currentUser={user} />;
}
