import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Raise a Ticket" };

export default function NewTicketPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Raise a Ticket"
        description="The ticket form (react-hook-form + zod, Sheet Link, attachments) is built in a later phase."
      />
      <div className="rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-sm text-text-muted">
        Ticket form coming soon.
      </div>
    </div>
  );
}
