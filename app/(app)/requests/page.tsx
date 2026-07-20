import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { requireUser } from "@/lib/authz";
import { listRequests } from "@/lib/db/queries";
import { isStaff } from "@/lib/roles";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ScopeToggle } from "@/components/dashboard/scope-toggle";
import { RequestsView } from "@/components/tickets/requests-view";
import { RequestViewToggle } from "@/components/tickets/request-view-toggle";

export const metadata: Metadata = { title: "Requests" };

export default async function RequestsPage() {
  const user = await requireUser();
  const requests = await listRequests({ id: user.id, role: user.role });

  return (
    <div className="space-y-6">
      <PageHeader
        title={isStaff(user.role) ? "System Requests" : "My Requests"}
        description={
          isStaff(user.role)
            ? "New-system requests — review, get them approved, build, and hand back for testing."
            : "New-system requests you've submitted and their progress."
        }
      >
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Staff only — /tickets is staff-gated, so a USER must not be offered a
              link that would just redirect them. They use the sidebar instead. */}
          {isStaff(user.role) ? <ScopeToggle /> : null}
          <RequestViewToggle />
          <Button asChild size="sm" className="shrink-0">
            <Link href="/requests/new">
              <Plus className="size-4" />
              New request
            </Link>
          </Button>
        </div>
      </PageHeader>

      <RequestsView requests={requests} currentUser={user} />
    </div>
  );
}
