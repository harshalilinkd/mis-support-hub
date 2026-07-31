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
        description="For a brand-new system that doesn't exist yet — tell MIS what you need and they'll design and build it. (Something in an existing system is broken? Use “Report an issue” instead.)"
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
