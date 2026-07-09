import type { Metadata } from "next";

import { requireRole } from "@/lib/authz";
import { listAllUsers } from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { PageHeader } from "@/components/shell/page-header";
import { UsersTable, type AdminUserView } from "@/components/settings/users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersSettingsPage() {
  // CLAUDE.md §6 — only MIS_ADMIN manages users. Non-admins are redirected.
  const admin = await requireRole("MIS_ADMIN");
  const rows = await listAllUsers();

  const users: AdminUserView[] = rows.map((u) => ({
    ...u,
    createdAt: toIso(u.createdAt),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Manage who can access the hub, their role, and their access."
      />
      <UsersTable users={users} currentUserId={admin.id} />
    </div>
  );
}
