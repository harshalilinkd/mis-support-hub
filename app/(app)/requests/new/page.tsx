import type { Metadata } from "next";

import { requireUser } from "@/lib/authz";
import { PageHeader } from "@/components/shell/page-header";
import { RequestForm } from "@/components/tickets/request-form";

export const metadata: Metadata = { title: "New System Request" };

export default async function NewRequestPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Request a new system"
        description="Tell us what you need built. MIS reviews it, gets it approved, then builds and hands it back to you to test."
      />
      <RequestForm
        requester={{
          name: user.name ?? "You",
          email: user.email ?? "",
          department: user.department,
        }}
      />
    </div>
  );
}
