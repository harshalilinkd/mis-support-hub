import type { Metadata } from "next";

import { requireRole, STAFF_ROLES } from "@/lib/authz";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // Staff-only surface (CLAUDE.md §6). USER role can't see all tickets.
  await requireRole(...STAFF_ROLES);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="KPI cards and the filterable ticket table land here in a later phase."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Open", "In Progress", "Resolved", "Closed"].map((label) => (
          <div
            key={label}
            className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]"
          >
            <div className="text-sm text-text-muted">{label}</div>
            <div className="mt-2 font-mono text-3xl font-medium tabular-nums">
              —
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
