import type { Role } from "@/lib/db/schema";

/**
 * Pure role helpers (type-only import) — safe to use from client components.
 * The redirect-based guards live in lib/authz.ts (server-only).
 */
export const STAFF_ROLES: Role[] = ["MIS_STAFF", "MIS_ADMIN"];

export function isStaff(role: Role): boolean {
  return role === "MIS_STAFF" || role === "MIS_ADMIN";
}
