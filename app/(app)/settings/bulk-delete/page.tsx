import type { Metadata } from "next";

import { requireRole } from "@/lib/authz";
import { listTicketsForBulkDelete } from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { BulkDeleteView } from "@/components/settings/bulk-delete-view";

export const metadata: Metadata = { title: "Bulk Delete" };

export default async function BulkDeletePage() {
  // CLAUDE.md §6 — deleting tickets in bulk is an admin management action.
  await requireRole("MIS_ADMIN");
  const rows = await listTicketsForBulkDelete();

  const tickets = rows.map((r) => ({
    id: r.id,
    number: r.number,
    title: r.title,
    type: r.type,
    department: r.department,
    status: r.status,
    priority: r.priority,
    createdByName: r.createdByName,
    createdAt: toIso(r.createdAt),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/settings"
        backLabel="Settings"
        title="Bulk Delete"
        description="Select multiple issues or system requests and move them to the recycle bin at once. Deleted tickets can be restored from the Recycle Bin."
      />
      <BulkDeleteView tickets={tickets} />
    </div>
  );
}
