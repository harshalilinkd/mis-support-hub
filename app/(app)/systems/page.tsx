import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";

import { requireUser } from "@/lib/authz";
import { listAssignableUsers, listSystems } from "@/lib/db/queries";
import { isStaff } from "@/lib/roles";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { SystemsView } from "@/components/systems/systems-view";

export const metadata: Metadata = { title: "Systems" };

export default async function SystemsPage() {
  // §13.3: the directory is readable by ANY authenticated user — deliberately not
  // row-scoped like tickets (§6). Only MIS gets the write affordances.
  const user = await requireUser();
  const canWrite = isStaff(user.role);

  const [systems, owners] = await Promise.all([
    listSystems(),
    listAssignableUsers(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Systems"
        description="Every system MIS has built — links, owners, and where to find them."
      >
        {canWrite ? (
          <Button asChild size="sm" className="shrink-0">
            <Link href="/systems/new">
              <Plus className="size-4" />
              <span className="hidden sm:inline">Log a system</span>
            </Link>
          </Button>
        ) : null}
      </PageHeader>

      {/* The facet needs id + name only. `owners` crosses into a client component,
          so anything on it is serialized to EVERY viewer incl. a plain USER — don't
          ship the staff roster's emails to build a dropdown. */}
      <SystemsView
        systems={systems}
        owners={owners.map((o) => ({ id: o.id, name: o.name }))}
        canWrite={canWrite}
      />
    </div>
  );
}
