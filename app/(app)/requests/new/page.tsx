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
        description="Use this ONLY to request a brand-new system that doesn't exist yet — MIS will design and build it. If something in an EXISTING system is broken or needs a change, use “Report an issue/changes” instead — not this form."
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
