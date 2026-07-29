import type { Metadata } from "next";

import { requireRole } from "@/lib/authz";
import { listAccessRequests } from "@/lib/db/queries";
import { PageHeader } from "@/components/shell/page-header";
import { AccessRequestsView } from "@/components/settings/access-requests-view";

export const metadata: Metadata = { title: "Access requests" };

export default async function AccessRequestsPage() {
  // §7: approving a request creates a user, so this is MIS_ADMIN only.
  await requireRole("MIS_ADMIN");
  const requests = await listAccessRequests();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Access requests"
        description="People who signed in with Google and are waiting to be let in. Approve to create their account (they start as an Employee — change their role in Users afterwards)."
      />
      <AccessRequestsView requests={requests} />
    </div>
  );
}
