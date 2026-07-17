"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { STAFF_ROLES } from "@/lib/authz";
import * as q from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/session";
import {
  addGranteeSchema,
  createSystemSchema,
  granteeIdSchema,
  listSystemsSchema,
  systemCodeSchema,
  systemIdSchema,
  updateSystemSchema,
} from "@/lib/validators/systems";
import { fail, ok, type ActionResult } from "./result";

/**
 * Systems Repository actions (CLAUDE.md §13). Purely additive — nothing here touches
 * the issue or request workflows.
 *
 * Permissions (§13.3): MIS staff create/edit/archive; MIS_ADMIN manages the grantee
 * config; ANY authenticated user reads the directory. Enforced here, never in the UI.
 */

function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function revalidateSystemRoutes(code?: string) {
  revalidatePath("/systems");
  if (code) revalidatePath(`/systems/${code}`);
}

/**
 * §13.4, the hard rule — re-derived from the LIVE grantee list on every create.
 *
 * Two checks, not one. The second is the stated requirement; the first exists
 * because the stated requirement is vacuous without it: "every active grantee has
 * confirmed = true" is trivially TRUE over an empty set, so a production database
 * with no grantees configured would let every system through a rule written to stop
 * exactly that. An empty checklist means the config is missing, not that everyone
 * approved.
 *
 * Returns the labels to snapshot, or an error string.
 */
async function requireFullChecklist(
  confirmations: { granteeId: string; confirmed: boolean }[]
): Promise<{ ok: true; grantees: { granteeId: string; granteeLabel: string }[] } | { ok: false; error: string }> {
  const active = await q.listActiveGranteesRow();

  if (active.length === 0) {
    return {
      ok: false,
      error:
        "No active access-grantees configured — add at least one before logging a system",
    };
  }

  // Index the client's ticks by id. The client's labels are ignored entirely: the
  // snapshot is taken from the server's own row, so a tampered payload can't forge
  // who access was granted to.
  const ticked = new Map(confirmations.map((c) => [c.granteeId, c.confirmed]));

  const missing = active.filter((g) => ticked.get(g.id) !== true);
  if (missing.length > 0) {
    const names = missing.map((g) => g.label).join(", ");
    return {
      ok: false,
      error: `Confirm access for every required person before logging: ${names}`,
    };
  }

  return {
    ok: true,
    grantees: active.map((g) => ({ granteeId: g.id, granteeLabel: g.label })),
  };
}

/** Log a built system into the directory. MIS only (§13.3). */
export async function createSystem(
  input: unknown
): Promise<ActionResult<{ id: string; code: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can log a system.");
  }
  const parsed = createSystemSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;

  // §13.4 — never trust the client checkboxes.
  const checklist = await requireFullChecklist(d.confirmations);
  if (!checklist.ok) return fail(checklist.error);

  const row = await q.createSystemRow({
    name: d.name,
    systemType: d.systemType,
    department: d.department,
    ownerId: d.ownerId,
    frontendUrl: d.frontendUrl,
    backendUrl: d.backendUrl ?? null,
    notes: d.notes ?? null,
    linkedTicketId: d.linkedTicketId ?? null,
    loggedBy: user.id,
    confirmations: checklist.grantees,
  });

  revalidateSystemRoutes(row.code);
  // The linked request's "system logged" flag lives on its detail page (§13.5).
  if (d.linkedTicketId) revalidatePath("/requests");
  return ok({ id: row.id, code: row.code });
}

/** Edit a system. MIS only (§13.3). updated_at bumps via the schema's $onUpdate. */
export async function updateSystem(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can edit a system.");
  }
  const parsed = updateSystemSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const { id, ...patch } = parsed.data;

  const existing = await q.getSystemById(id);
  if (!existing) return fail("System not found.");

  // Drop undefined keys so a partial patch can't blank a column it didn't mention.
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(clean).length === 0) return ok(undefined);

  const row = await q.updateSystemRow(id, clean);
  if (!row) return fail("System not found.");

  revalidateSystemRoutes(row.code);
  return ok(undefined);
}

/** Retire a system. MIS only. Never a hard delete (§13.3). */
export async function archiveSystem(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can archive a system.");
  }
  const parsed = systemIdSchema.safeParse({ id });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const row = await q.archiveSystemRow(parsed.data.id);
  if (!row) return fail("System not found.");

  revalidateSystemRoutes(row.code);
  return ok(undefined);
}

/**
 * The directory. ANY authenticated user (§13.3) — deliberately not row-scoped the
 * way tickets are (§6): a directory you can't search doesn't do its job.
 */
export async function listSystems(
  input: unknown = {}
): Promise<ActionResult<q.SystemListRow[]>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  const parsed = listSystemsSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const rows = await q.listSystems(parsed.data);
  return ok(rows);
}

/** Deep-link detail by code. Any authenticated user (§13.3). */
export async function getSystem(code: string): Promise<ActionResult<q.SystemDetail>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  const parsed = systemCodeSchema.safeParse({ code });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const row = await q.getSystemByCode(parsed.data.code);
  if (!row) return fail("System not found.");
  return ok(row);
}

/** The required checklist for the log-a-system form (§13.2). Any signed-in user. */
export async function listActiveGrantees(): Promise<
  ActionResult<{ id: string; label: string; sortOrder: number }[]>
> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  const rows = await q.listActiveGranteesRow();
  return ok(rows.map((g) => ({ id: g.id, label: g.label, sortOrder: g.sortOrder })));
}

/** Grantee config — MIS_ADMIN only (§13.3). */
export async function addGrantee(label: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (user.role !== "MIS_ADMIN") {
    return fail("Only an MIS admin can manage access-grantees.");
  }
  const parsed = addGranteeSchema.safeParse({ label });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  await q.addGranteeRow(parsed.data.label);
  revalidatePath("/settings/grantees");
  revalidateSystemRoutes();
  return ok(undefined);
}

/**
 * Deactivate a grantee — MIS_ADMIN only (§13.3). Never deletes: past confirmations
 * must keep pointing at a real row, and their snapshotted label is the record anyway.
 */
export async function deactivateGrantee(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (user.role !== "MIS_ADMIN") {
    return fail("Only an MIS admin can manage access-grantees.");
  }
  const parsed = granteeIdSchema.safeParse({ id });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const row = await q.deactivateGranteeRow(parsed.data.id);
  if (!row) return fail("Grantee not found.");

  revalidatePath("/settings/grantees");
  revalidateSystemRoutes();
  return ok(undefined);
}
