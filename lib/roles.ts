import type { Role } from "@/lib/db/schema";

/**
 * Pure role helpers (type-only import) — safe to use from client components.
 * The redirect-based guards live in lib/authz.ts (server-only).
 */
export const STAFF_ROLES: Role[] = ["MIS_STAFF", "MIS_ADMIN"];

/**
 * Roles offered in the admin role picker — two tiers only: normal users and the
 * MIS team (MIS_ADMIN). MIS_STAFF is retired (kept in the DB enum for any legacy
 * rows, but never assigned); the MIS team is MIS_ADMIN.
 */
export const ROLES: Role[] = ["USER", "MIS_ADMIN"];

export const ROLE_LABELS: Record<Role, string> = {
  USER: "Employee",
  MIS_STAFF: "MIS Staff",
  MIS_ADMIN: "MIS Admin",
};

export function isStaff(role: Role): boolean {
  return role === "MIS_STAFF" || role === "MIS_ADMIN";
}
