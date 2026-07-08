import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";

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

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={number}
        description="Full ticket detail (activity trail, comments, attachments, actions) is built in a later phase."
      />
      <div className="rounded-[var(--radius-card)] border border-dashed border-border p-10 text-center text-sm text-text-muted">
        Ticket <span className="font-mono">{number}</span> detail coming soon.
      </div>
    </div>
  );
}
