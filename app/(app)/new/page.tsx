import type { Metadata } from "next";

import { requireUser } from "@/lib/authz";
import { PageHeader } from "@/components/shell/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";

export const metadata: Metadata = { title: "Raise a Ticket" };

export default async function NewTicketPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Raise a Ticket"
        description="Tell MIS what's broken. You'll get a ticket number to track it."
      />
      <NewTicketForm
        requester={{
          name: user.name ?? "You",
          email: user.email ?? "",
          department: user.department,
        }}
      />
    </div>
  );
}
