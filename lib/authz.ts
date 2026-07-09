import { redirect } from "next/navigation";

import type { Role } from "@/lib/db/schema";
import { getCurrentUser, type SessionUser } from "@/lib/session";

/**
 * Require an authenticated user with one of the given roles (any role if none
 * are listed). Enforce authorization on the server — never trust the client
 * (CLAUDE.md §6). For use at the top of pages, layouts, and Server Actions.
 *
 * - Not signed in            → redirect to /login
 * - Signed in, wrong role    → redirect to /my (their own tickets)
 *
 * Returns the user so callers can use it directly.
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles.length > 0 && !roles.includes(user.role)) redirect("/my");
  return user;
}

/** Require any authenticated user (no role restriction). */
export function requireUser(): Promise<SessionUser> {
  return requireRole();
}

/** Non-redirecting check — useful for conditional UI. */
export function hasRole(user: SessionUser | null, ...roles: Role[]): boolean {
  return !!user && (roles.length === 0 || roles.includes(user.role));
}

/** MIS staff or admin — the "can see all tickets / dashboard / board" group. */
export { STAFF_ROLES } from "@/lib/roles";
