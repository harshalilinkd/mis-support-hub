import type { Metadata } from "next";
import { notFound } from "next/navigation";

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
    <div className="mx-auto max-w-3xl">
      <SystemDetailView system={system} owners={owners} currentUser={user} />
    </div>
  );
}
