import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { requireUser } from "@/lib/authz";
import { listRequests } from "@/lib/db/queries";
import { isStaff } from "@/lib/roles";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ScopeToggle } from "@/components/dashboard/scope-toggle";
import { RequestBoardView } from "@/components/tickets/request-board-view";
import { RequestViewToggle } from "@/components/tickets/request-view-toggle";

export const metadata: Metadata = { title: "Request Board" };

export default async function RequestBoardPage() {
  // Everyone can see the board — listRequests enforces §12.7 row-level visibility
  // (a USER only sees their own), and the requester needs it to accept & close.
  const user = await requireUser();
  const requests = await listRequests({ id: user.id, role: user.role });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Request Board"
        description={
          isStaff(user.role)
            ? "The request pipeline — drag a card to move it, where the rules allow."
            : "Your requests as they move through review, approval, build, and testing."
        }
      >
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {/* Staff only — /board is staff-gated (see the requests list). */}
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

      <RequestBoardView requests={requests} currentUser={user} />
    </div>
  );
}
