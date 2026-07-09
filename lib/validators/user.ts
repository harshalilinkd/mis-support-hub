import { z } from "zod";

/**
 * Mirrors the `role` enum in lib/db/schema.ts, kept independent so this
 * validator can be imported anywhere without pulling in the DB driver
 * (same convention as lib/validators/ticket.ts).
 */
export const ROLE_VALUES = ["USER", "MIS_STAFF", "MIS_ADMIN"] as const;

export const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLE_VALUES),
});
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;

export const setActiveSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.boolean(),
});
export type SetActiveInput = z.infer<typeof setActiveSchema>;
