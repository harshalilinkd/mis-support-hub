import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/authz";
import { getTicketByNumber } from "@/lib/db/queries";
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

  // getTicketByNumber enforces §6 row-level visibility for the viewer.
  const ticket = await getTicketByNumber(number, {
    id: user.id,
    role: user.role,
  });
  if (!ticket) notFound();

  return <TicketDetail ticket={ticket} currentUser={user} />;
}
