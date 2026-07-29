import type { Metadata } from "next";

import { requireRole } from "@/lib/authz";
import { listAllGranteesRow } from "@/lib/db/queries";
import { PageHeader } from "@/components/shell/page-header";
import { GranteesView } from "@/components/settings/grantees-view";

export const metadata: Metadata = { title: "Access grantees" };

export default async function GranteesPage() {
  // §13.3: managing the grantee config is MIS_ADMIN only.
  await requireRole("MIS_ADMIN");
  // No action wraps listAllGranteesRow — a Server Component reads the query directly.
  const grantees = await listAllGranteesRow();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Access grantees"
        description="This is NOT about who can log into the app. It's the sharing checklist for the Systems directory: before MIS can log a built system, they must confirm everyone listed here has been given access to it (e.g. shared on the Google Sheet). To add or manage people who sign into the app, use Settings → Users or Access requests."
      />
      <GranteesView grantees={grantees} />
    </div>
  );
}
