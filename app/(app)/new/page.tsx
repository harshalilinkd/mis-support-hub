import type { Metadata } from "next";

import { requireUser } from "@/lib/authz";
import { PageHeader } from "@/components/shell/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";

export const metadata: Metadata = { title: "Raise a Ticket" };

export default async function NewTicketPage() {
  const user = await requireUser();
  const requester = user.name ? `${user.name} · ${user.email}` : (user.email ?? "");

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Raise a Ticket"
        description="Tell MIS what's broken. You'll get a ticket number to track it."
      />
      <NewTicketForm requester={requester} />
    </div>
  );
}
