import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, ListX, ShieldCheck, Trash2, Users } from "lucide-react";

import { requireRole } from "@/lib/authz";
import { PageHeader } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Settings" };

// The admin tools live here rather than in the main sidebar.
const SECTIONS = [
  {
    href: "/settings/users",
    label: "Users",
    description:
      "Manage accounts, roles, and departments; add users in bulk.",
    icon: Users,
  },
  {
    href: "/settings/bulk-delete",
    label: "Bulk Delete",
    description:
      "Select multiple tickets and move them to the recycle bin at once.",
    icon: ListX,
  },
  {
    href: "/settings/recycle-bin",
    label: "Recycle Bin",
    description: "Restore deleted tickets or remove them permanently.",
    icon: Trash2,
  },
  {
    href: "/settings/grantees",
    label: "Access Grantees",
    description:
      "Who must be granted access before a system can be logged in the directory.",
    icon: ShieldCheck,
  },
];

export default async function SettingsPage() {
  // All settings tools are admin-only (CLAUDE.md §6).
  await requireRole("MIS_ADMIN");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Administer the workspace — users, bulk ticket cleanup, and the recycle bin."
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-elevation)] transition-shadow hover:shadow-[var(--shadow-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <div className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-input)] bg-accent-soft text-primary">
              <s.icon className="size-[18px]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.label}</div>
              <p className="mt-0.5 text-sm text-text-muted">{s.description}</p>
            </div>
            <ChevronRight className="mt-1 size-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
