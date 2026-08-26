"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";

import {
  getUserByEmail,
  getUserById,
  insertUserWithRole,
  reassignReferencesAndDeleteUser,
  releaseTicketsOfUser,
  setUserActiveStatus,
  setUserPasswordHash,
  setUserProfile,
  setUserRole,
  updateUserProfile,
} from "@/lib/db/queries";
import type { Department, Role } from "@/lib/db/schema";
import { isEmailDomainAllowed } from "@/lib/email-domains";
import { getCurrentUser } from "@/lib/session";
import { DEPARTMENT_LABELS, DEPARTMENTS } from "@/lib/validators/ticket";
import {
  adminSetPasswordSchema,
  createUserSchema,
  deleteUserSchema,
  editUserSchema,
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

/**
 * Change (or, for a Google-only account, set) the current user's own password.
 * If they already have one, the correct current password is required.
 */
export async function changeMyPassword(input: {
  currentPassword?: string;
  newPassword: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const newPassword = input?.newPassword ?? "";
  if (newPassword.length < 8) {
    return fail("New password must be at least 8 characters.");
  }
  if (newPassword.length > 200) return fail("Keep it under 200 characters.");

  const full = await getUserById(user.id);
  if (!full) return fail("Account not found.");

  // Existing password → the correct current one is required. Google-only accounts
  // (no password yet) may set one without a current password.
  if (full.passwordHash) {
    const current = input?.currentPassword ?? "";
    if (!current) return fail("Enter your current password.");
    const okCurrent = await bcrypt.compare(current, full.passwordHash);
    if (!okCurrent) return fail("Current password is incorrect.");
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await setUserPasswordHash(user.id, hash);
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

/** "employee"/"user" → USER; "admin"/"mis admin" → MIS_ADMIN; blank → USER. */
function normalizeRole(input: string): Role | null {
  const v = (input ?? "").trim().toLowerCase().replace(/[\s_]+/g, "");
  if (!v) return "USER";
  if (["user", "employee", "emp"].includes(v)) return "USER";
  if (["misadmin", "admin"].includes(v)) return "MIS_ADMIN";
  if (["misstaff", "staff"].includes(v)) return "MIS_STAFF";
  return null; // unrecognized
}

/** Accepts the code ("LD_SILK_MILLS") or label ("LD Silk Mills"); blank → null. */
function normalizeDepartment(input: string): Department | null | undefined {
  const v = (input ?? "").trim();
  if (!v) return null;
  const code = v.toUpperCase().replace(/[\s-]+/g, "_");
  if ((DEPARTMENTS as readonly string[]).includes(code)) return code as Department;
  const byLabel = DEPARTMENTS.find(
    (d) => DEPARTMENT_LABELS[d].toLowerCase() === v.toLowerCase()
  );
  return byLabel ?? undefined; // undefined = unrecognized
}

/**
 * Bulk "add users" — one row per user (name, department, email, role, password).
 * Each row is validated independently; good rows are created, bad rows are
 * skipped with a reason. MIS_ADMIN only (CLAUDE.md §6).
 */
export async function adminBulkCreateUsers(input: {
  rows: {
    name: string;
    department: string;
    email: string;
    role: string;
    password: string;
  }[];
}): Promise<
  ActionResult<{
    created: number;
    skipped: { row: number; email: string; error: string }[];
  }>
> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can add users.");
  }
  const rows = input?.rows ?? [];
  if (!rows.length) return fail("Nothing to import — paste at least one row.");
  if (rows.length > 100) return fail("Import up to 100 users at a time.");

  let created = 0;
  const skipped: { row: number; email: string; error: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const raw = rows[i];
    const at = i + 1;
    const label = raw.email?.trim() || raw.name?.trim() || `row ${at}`;

    const role = normalizeRole(raw.role);
    if (!role) {
      skipped.push({ row: at, email: label, error: `Unknown role "${raw.role}"` });
      continue;
    }
    const department = normalizeDepartment(raw.department);
    if (department === undefined) {
      skipped.push({
        row: at,
        email: label,
        error: `Unknown department "${raw.department}"`,
      });
      continue;
    }

    const parsed = createUserSchema.safeParse({
      name: raw.name,
      email: raw.email,
      password: raw.password,
      role,
      department,
    });
    if (!parsed.success) {
      skipped.push({
        row: at,
        email: label,
        error: parsed.error.issues[0]?.message ?? "Invalid row",
      });
      continue;
    }
    const email = parsed.data.email;
    if (seen.has(email)) {
      skipped.push({ row: at, email, error: "Duplicate in this list" });
      continue;
    }
    seen.add(email);
    if (!isEmailDomainAllowed(email)) {
      skipped.push({ row: at, email, error: "Email domain not allowed" });
      continue;
    }
    if (await getUserByEmail(email)) {
      skipped.push({ row: at, email, error: "Already exists" });
      continue;
    }
    try {
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      await insertUserWithRole({
        name: parsed.data.name,
        email,
        passwordHash,
        role: parsed.data.role,
        department: parsed.data.department,
      });
      created++;
    } catch {
      skipped.push({ row: at, email, error: "Could not create" });
    }
  }

  revalidatePath("/settings/users");
  return ok({ created, skipped });
}

/** Activate/deactivate a user. Admins can't deactivate themselves. */
export async function setUserActive(
  userId: string,
  isActive: boolean
): Promise<ActionResult<{ released: number }>> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can manage users.");
  }

  const parsed = setActiveSchema.safeParse({ userId, isActive });
  if (!parsed.success) return fail("Invalid request.");

  if (parsed.data.userId === admin.id) {
    return fail("You can't deactivate your own account.");
  }

  // Deactivating locks the door, so FIRST release the member's in-flight tickets
  // back to the pool — otherwise the ownership lock (§6) would freeze them once
  // they can no longer sign in. Release before deactivating: if it fails we don't
  // deactivate, so the admin can retry cleanly and a ticket is never stranded.
  let released = 0;
  if (!parsed.data.isActive) {
    try {
      released = await releaseTicketsOfUser(parsed.data.userId, admin.id);
    } catch (e) {
      console.error("[setUserActive] failed to release tickets", e);
      return fail(
        "Couldn't release this member's tickets, so they weren't deactivated. Please try again."
      );
    }
  }

  await setUserActiveStatus(parsed.data.userId, parsed.data.isActive);

  revalidatePath("/settings/users");
  if (released > 0) {
    revalidatePath("/tickets");
    revalidatePath("/dashboard");
    revalidatePath("/board");
    revalidatePath("/my");
  }
  return ok({ released });
}

/**
 * Edit a user's profile (name, email, department). Enforces the company-domain
 * allowlist (CLAUDE.md §7) and rejects an email already used by someone else.
 */
export async function adminUpdateUser(input: {
  userId: string;
  name: string;
  email: string;
  department: string | null;
}): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can edit users.");
  }

  const parsed = editUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the form and try again.");
  }
  const { userId, name, email, department } = parsed.data;

  if (!isEmailDomainAllowed(email)) {
    return fail("Use an approved company email domain.");
  }

  const existing = await getUserByEmail(email);
  if (existing && existing.id !== userId) {
    return fail("Another user already has this email.");
  }

  try {
    await updateUserProfile({ id: userId, name, email, department });
  } catch {
    return fail("Could not update the user. Please try again.");
  }

  revalidatePath("/settings/users");
  return ok(undefined);
}

/**
 * Set (or reset) another user's password — MIS_ADMIN only.
 *
 * **An admin cannot be shown the user's existing password, and no change here can make
 * that possible.** `users.password_hash` stores a bcrypt hash, which is a ONE-WAY
 * function: the hash is what the login check re-computes against, and the original text
 * is not stored anywhere and cannot be derived from it. The only way an admin could
 * "see" a password is if the app stored it in plain text, which would hand every
 * password in the company to anyone who ever read the database — exactly the failure a
 * hash exists to prevent. So the admin power is to REPLACE the password, not read it.
 *
 * Unlike `changeMyPassword`, no current password is required: an admin doing a reset
 * doesn't have it. That makes this a genuine account-takeover tool, which is why it is
 * MIS_ADMIN-gated and why the new password is only ever handed over out-of-band by the
 * admin who set it. The user can change it themselves afterwards in Profile.
 */
export async function adminSetUserPassword(input: {
  userId: string;
  newPassword: string;
}): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can set a user's password.");
  }

  const parsed = adminSetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the password and try again.");
  }

  const target = await getUserById(parsed.data.userId);
  if (!target) return fail("User not found.");

  const hash = await bcrypt.hash(parsed.data.newPassword, 10);
  await setUserPasswordHash(target.id, hash);

  revalidatePath("/settings/users");
  return ok(undefined);
}

/**
 * Hard-delete a user. Blocked only for your own account. Any ticket history the
 * user is part of (tickets, comments, activity, attachments) is reattributed to
 * a "Deleted user" placeholder so the audit trail survives (CLAUDE.md §4);
 * accounts/sessions/notifications cascade automatically.
 */
export async function adminDeleteUser(userId: string): Promise<ActionResult> {
  const admin = await getCurrentUser();
  if (!admin || admin.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can delete users.");
  }

  const parsed = deleteUserSchema.safeParse({ userId });
  if (!parsed.success) return fail("Invalid request.");

  if (parsed.data.userId === admin.id) {
    return fail("You can't delete your own account.");
  }

  try {
    await reassignReferencesAndDeleteUser(parsed.data.userId);
  } catch (e) {
    // Log the real cause (almost always an unhandled FK reference to users.id) so a
    // future failure is diagnosable instead of a silent generic message.
    console.error("[adminDeleteUser]", e);
    return fail("Could not delete this user. Please try again.");
  }

  revalidatePath("/settings/users");
  return ok(undefined);
}
