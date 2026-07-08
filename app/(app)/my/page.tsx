import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "My Tickets" };

export default function MyTicketsPage() {
  return (
    <div>
      <PageHeader
        title="My Tickets"
        description="Tickets you've raised. The filterable list arrives in a later phase."
      />
      <div className="rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-sm text-text-muted">
        No tickets yet — raise one from “Raise Ticket”.
      </div>
    </div>
  );
}
