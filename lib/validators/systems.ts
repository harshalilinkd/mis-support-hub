import { z } from "zod";

import { DEPARTMENTS } from "./ticket";

/**
 * Systems Repository validators (CLAUDE.md §13).
 *
 * Enum values are mirrored as const tuples here rather than imported from
 * lib/db/schema.ts, following the convention in lib/validators/user.ts: a validator
 * must be importable from a client component without dragging the DB driver in.
 */
export const SYSTEM_TYPES = ["SHEET", "APPS_SCRIPT", "WEB_APP", "OTHER"] as const;
export const SYSTEM_STATUSES = ["ACTIVE", "DEPRECATED", "ARCHIVED"] as const;

export const SYSTEM_TYPE_LABELS: Record<(typeof SYSTEM_TYPES)[number], string> = {
  SHEET: "Google Sheet",
  APPS_SCRIPT: "Apps Script",
  WEB_APP: "Web app",
  OTHER: "Other",
};

export const SYSTEM_STATUS_LABELS: Record<(typeof SYSTEM_STATUSES)[number], string> = {
  ACTIVE: "Active",
  DEPRECATED: "Deprecated",
  ARCHIVED: "Archived",
};

/**
 * `frontend_url` is REQUIRED and must be a real URL — a stricter contract than
 * tickets.sheet_link, which deliberately accepts "a URL OR a plain system name".
 * Validating here means the shared isUrl() render guard can never meet a row it
 * has to downgrade to plain text.
 */
const requiredUrl = z
  .string()
  .trim()
  .min(1, "Add the link people actually open")
  .url("Enter a full URL (https://…)")
  .max(2000);

/** Optional URL: an empty string from an untouched input means "not set", not invalid. */
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .url("Enter a full URL (https://…)")
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalNotes = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .or(z.literal("").transform(() => undefined));

/** One checklist tick. The label is NOT taken from the client — it's snapshotted server-side. */
export const confirmationInputSchema = z.object({
  granteeId: z.string().uuid(),
  confirmed: z.boolean(),
});

export const createSystemSchema = z.object({
  name: z.string().trim().min(2, "Name the system").max(200),
  systemType: z.enum(SYSTEM_TYPES),
  department: z.enum(DEPARTMENTS),
  ownerId: z.string().uuid("Pick an owner"),
  frontendUrl: requiredUrl,
  backendUrl: optionalUrl,
  notes: optionalNotes,
  linkedTicketId: z.string().uuid().optional(),
  // Shape only. §13.4's real gate — every ACTIVE grantee present and confirmed — is
  // re-checked server-side against a fresh read; the client list is never trusted.
  confirmations: z.array(confirmationInputSchema),
});
export type CreateSystemInput = z.infer<typeof createSystemSchema>;

/** Every field is optional — a patch. `status` is here; archiving has its own action. */
export const updateSystemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2, "Name the system").max(200).optional(),
  systemType: z.enum(SYSTEM_TYPES).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  ownerId: z.string().uuid().optional(),
  frontendUrl: requiredUrl.optional(),
  backendUrl: optionalUrl,
  notes: optionalNotes,
  status: z.enum(SYSTEM_STATUSES).optional(),
});
export type UpdateSystemInput = z.infer<typeof updateSystemSchema>;

export const systemIdSchema = z.object({ id: z.string().uuid() });

export const systemCodeSchema = z.object({
  code: z.string().trim().min(1).max(40),
});

export const listSystemsSchema = z.object({
  search: z.string().trim().max(200).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  systemType: z.enum(SYSTEM_TYPES).optional(),
  status: z.enum(SYSTEM_STATUSES).optional(),
  ownerId: z.string().uuid().optional(),
});
export type ListSystemsInput = z.infer<typeof listSystemsSchema>;

export const addGranteeSchema = z.object({
  label: z.string().trim().min(2, "Enter the person's name").max(120),
});

export const granteeIdSchema = z.object({ id: z.string().uuid() });
