import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireUser } from "@/lib/authz";
import { getSystemByCode, listAssignableUsers } from "@/lib/db/queries";
import { SystemDetailView } from "@/components/systems/system-detail";

export const metadata: Metadata = { title: "System" };

export default async function SystemDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  // Readable by any authenticated user (§13.3).
  const user = await requireUser();
  const { code } = await params;

  const system = await getSystemByCode(decodeURIComponent(code));
  if (!system) notFound();

  // Only needed for the MIS edit dialog's owner picker.
  const owners = await listAssignableUsers();

  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Link
        href="/systems"
        className="inline-flex items-center gap-1 rounded-[6px] text-sm font-medium text-text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="size-4" />
        Systems
      </Link>
      <SystemDetailView system={system} owners={owners} currentUser={user} />
    </div>
  );
}
