import { z } from "zod";

import { DEPARTMENTS } from "./ticket";

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

/** Admin "add user": an email + password account with a chosen role/department. */
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(200, "Keep it under 200 characters"),
  role: z.enum(ROLE_VALUES),
  department: z.enum(DEPARTMENTS).nullable(),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/** Admin "edit user": editable profile fields (role/status handled inline). */
export const editUserSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(1, "Enter a name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  department: z.enum(DEPARTMENTS).nullable(),
});
export type EditUserInput = z.infer<typeof editUserSchema>;

/** The same fields minus userId — used as the client form resolver. */
export const editUserFormSchema = editUserSchema.omit({ userId: true });
export type EditUserFormInput = z.infer<typeof editUserFormSchema>;

export const deleteUserSchema = z.object({
  userId: z.string().uuid(),
});
