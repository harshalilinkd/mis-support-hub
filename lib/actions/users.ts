"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import {
  getUserByEmail,
  insertUserWithRole,
  setUserActiveStatus,
  setUserProfile,
  setUserRole,
} from "@/lib/db/queries";
import { isEmailDomainAllowed } from "@/lib/email-domains";
import { getCurrentUser } from "@/lib/session";
import { DEPARTMENTS } from "@/lib/validators/ticket";
import {
  createUserSchema,
  setActiveSchema,
  updateRoleSchema,
} from "@/lib/validators/user";
import { fail, ok, type ActionResult } from "./result";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  department: z.enum(DEPARTMENTS).nullable(),
});

/** Set the current user's name + home department (shown when raising tickets). */
export async function updateMyProfile(
  name: string,
  department: string | null
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = schema.safeParse({ name, department });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid profile.");
  }

  await setUserProfile(user.id, parsed.data.name, parsed.data.department);
  revalidatePath("/", "layout");
  return ok(undefined);
}

/* ------------------------------------------------------------------ *
 * Admin — user management (CLAUDE.md §6: MIS_ADMIN only). Every action
 * re-checks the role on the server; never trust the client.
 * ------------------------------------------------------------------ */

/** Change another user's role. Admins can't change their own (anti-lockout). */
export async function updateUserRole(
  userId: string,
  role: string
): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can manage users.");
  }

  const parsed = updateRoleSchema.safeParse({ userId, role });
  if (!parsed.success) return fail("Invalid role change.");

  if (parsed.data.userId === admin.id) {
    return fail("You can't change your own role.");
  }

  await setUserRole(parsed.data.userId, parsed.data.role);
  revalidatePath("/settings/users");
  return ok(undefined);
}

/**
 * Create a new user (email + password) with a chosen role/department. Enforces
 * the company-domain allowlist (CLAUDE.md §7) and rejects duplicate emails.
 */
export async function adminCreateUser(input: {
  name: string;
  email: string;
  password: string;
  role: string;
  department: string | null;
}): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can add users.");
  }

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }
  const { name, email, password, role, department } = parsed.data;

  if (!isEmailDomainAllowed(email)) {
    return fail("Use an approved company email domain.");
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return fail("A user with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await insertUserWithRole({ name, email, passwordHash, role, department });
  } catch {
    // Unique-constraint race (two admins at once) or a transient DB error.
    return fail("Could not create the user. Please try again.");
  }

  revalidatePath("/settings/users");
  return ok(undefined);
}

/** Activate/deactivate a user. Admins can't deactivate themselves. */
export async function setUserActive(
  userId: string,
  isActive: boolean
): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can manage users.");
  }

  const parsed = setActiveSchema.safeParse({ userId, isActive });
  if (!parsed.success) return fail("Invalid request.");

  if (parsed.data.userId === admin.id) {
    return fail("You can't deactivate your own account.");
  }

  await setUserActiveStatus(parsed.data.userId, parsed.data.isActive);
  revalidatePath("/settings/users");
  return ok(undefined);
}
