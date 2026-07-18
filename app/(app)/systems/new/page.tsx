import type { Metadata } from "next";

import { requireRole } from "@/lib/authz";
import { STAFF_ROLES } from "@/lib/roles";
import {
  listActiveGranteesRow,
  listAssignableUsers,
} from "@/lib/db/queries";
import { PageHeader } from "@/components/shell/page-header";
import { SystemForm } from "@/components/systems/system-form";

export const metadata: Metadata = { title: "Log a system" };

export default async function NewSystemPage({
  searchParams,
}: {
  // Pre-fill when logging off the back of a REQUEST (§13.5).
  searchParams: Promise<{ ticket?: string; name?: string }>;
}) {
  // §13.3: only MIS logs a system. A USER landing here is redirected, matching the
  // server-side gate in createSystem rather than dangling a form they can't submit.
  const user = await requireRole(...STAFF_ROLES);
  const { ticket, name } = await searchParams;
  // Only honour a well-formed uuid. linkedTicketId is a HIDDEN field, so a malformed
  // ?ticket= would fail createSystemSchema with no error anyone can see — the submit
  // would just silently do nothing. Ignore junk instead.
  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const linkedTicketId = ticket && UUID_RE.test(ticket) ? ticket : undefined;

  const [owners, grantees] = await Promise.all([
    listAssignableUsers(),
    listActiveGranteesRow(),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Log a system"
        description="So its links are never lost and anyone can find it."
        backHref="/systems"
        backLabel="Systems"
      />
      <SystemForm
        owners={owners}
        // The form only needs id + label; isActive/createdAt are noise here.
        grantees={grantees.map((g) => ({ id: g.id, label: g.label }))}
        currentUser={user}
        linkedTicketId={linkedTicketId}
        defaultName={name}
      />
    </div>
  );
}
