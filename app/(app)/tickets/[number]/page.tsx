import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/lib/authz";
import { getTicketByNumber } from "@/lib/db/queries";
import { PageHeader } from "@/components/shell/page-header";
import { AttachmentGrid } from "@/components/tickets/attachment-grid";

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

  const attachments = ticket.attachments.map((a) => ({
    id: a.id,
    url: a.url,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={ticket.number} description={ticket.title} />

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
        <h2 className="mb-3 font-display text-sm font-semibold">Attachments</h2>
        <AttachmentGrid attachments={attachments} />
      </section>

      <p className="text-center text-xs text-text-muted">
        Full ticket detail (activity, comments, and actions) arrives in a later phase.
      </p>
    </div>
  );
}
