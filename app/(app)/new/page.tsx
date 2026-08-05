import type { Metadata } from "next";

import { requireUser } from "@/lib/authz";
import { PageHeader } from "@/components/shell/page-header";
import { NewTicketForm } from "@/components/tickets/new-ticket-form";

export const metadata: Metadata = { title: "Raise a Ticket" };

export default async function NewTicketPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-[calc(42rem_+_2cm)]">
      <PageHeader
        title="Raise a Ticket"
        description="For a problem with an existing system, sheet, or app — something broken, wrong, or not working. (Need a brand-new system built? Use “Request a new system” instead.)"
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
