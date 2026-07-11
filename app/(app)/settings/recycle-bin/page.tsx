import type { Metadata } from "next";

import { requireRole } from "@/lib/authz";
import { listDeletedTickets } from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { RecycleBinView } from "@/components/settings/recycle-bin-view";

export const metadata: Metadata = { title: "Recycle Bin" };

export default async function RecycleBinPage() {
  // CLAUDE.md §6 — only MIS_ADMIN manages the recycle bin.
  await requireRole("MIS_ADMIN");
  const rows = await listDeletedTickets();

  const tickets = rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    department: r.department,
    status: r.status,
    priority: r.priority,
    createdByName: r.createdByName,
    deletedByName: r.deletedByName,
    deletedAt: r.deletedAt ? toIso(r.deletedAt) : "",
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recycle Bin"
        description="Deleted tickets are kept here. Restore one, or delete it permanently to remove it for good."
      />
      <RecycleBinView tickets={tickets} />
    </div>
  );
}
