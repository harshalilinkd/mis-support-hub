"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  approveAccessRequestTx,
  getAccessRequestById,
  getUserByEmail,
  linkApprovedAccessRequest,
  rejectAccessRequest,
} from "@/lib/db/queries";
import { sendAccessApprovedNotification } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";
import { fail, ok, type ActionResult } from "./result";

const idSchema = z.object({ requestId: z.string().uuid() });

/**
 * Approve a Google access request (§7). MIS_ADMIN only — this is the ONE new path
 * that creates a `users` row, so it must be an admin action, keeping §7 intact.
 *
 * The new account is always role USER (Employee); the admin changes role/department
 * afterwards in Settings → Users, exactly as with an admin-created account.
 */
export async function approveAccessRequest(
  requestId: string
): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can approve access requests.");
  }
  const parsed = idSchema.safeParse({ requestId });
  if (!parsed.success) return fail("Invalid request.");

  const request = await getAccessRequestById(parsed.data.requestId);
  if (!request) return fail("That request no longer exists.");
  if (request.status !== "PENDING") {
    return fail(`This request was already ${request.status.toLowerCase()}.`);
  }

  // An admin may have added this person via Settings → Users in the meantime. If a
  // users row already exists for the email, link + mark approved rather than insert a
  // duplicate (which would hit the unique-email constraint).
  let newUser: { id: string; email: string; name: string | null };
  try {
    const existing = await getUserByEmail(request.email);
    if (existing) {
      await linkApprovedAccessRequest({
        requestId: request.id,
        existingUserId: existing.id,
        adminId: admin.id,
      });
      newUser = { id: existing.id, email: existing.email, name: existing.name };
    } else {
      const { userId } = await approveAccessRequestTx({
        requestId: request.id,
        email: request.email,
        name: request.name,
        image: request.image,
        adminId: admin.id,
      });
      newUser = { id: userId, email: request.email, name: request.name };
    }
  } catch {
    return fail("Could not approve the request. Please try again.");
  }

  // Best-effort (§8): tell the new user they're in. Never blocks the approval.
  await sendAccessApprovedNotification(newUser);

  revalidatePath("/settings/access-requests");
  revalidatePath("/settings/users");
  return ok(undefined);
}

/** Reject a Google access request (§7). MIS_ADMIN only; REJECTED is sticky. */
export async function rejectAccessRequestAction(
  requestId: string
): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can reject access requests.");
  }
  const parsed = idSchema.safeParse({ requestId });
  if (!parsed.success) return fail("Invalid request.");

  const request = await getAccessRequestById(parsed.data.requestId);
  if (!request) return fail("That request no longer exists.");
  if (request.status !== "PENDING") {
    return fail(`This request was already ${request.status.toLowerCase()}.`);
  }

  try {
    await rejectAccessRequest(request.id, admin.id);
  } catch {
    return fail("Could not reject the request. Please try again.");
  }

  revalidatePath("/settings/access-requests");
  return ok(undefined);
}
