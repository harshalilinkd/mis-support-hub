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
 * Guess the system type from its frontend URL — a convenience default only.
 *
 * The caller must never let this override a manual choice: it is a starting point,
 * not a classifier. Returns null when the URL isn't parseable yet (people type into
 * the field character by character), so a half-typed URL doesn't churn the select.
 *
 * Host-based, not substring-based: a naive `url.includes("script.google.com")` would
 * match `https://evil.test/?x=script.google.com`.
 */
export function systemTypeFromUrl(
  url: string
): (typeof SYSTEM_TYPES)[number] | null {
  let host: string;
  try {
    host = new URL(url.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (host === "docs.google.com") {
    // Only /spreadsheets is a Sheet — docs.google.com also serves Docs, Slides, Forms.
    try {
      if (new URL(url.trim()).pathname.startsWith("/spreadsheets")) return "SHEET";
    } catch {
      return null;
    }
    return "OTHER";
  }
  if (host === "script.google.com") return "APPS_SCRIPT";
  return "WEB_APP";
}

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

/**
 * An emptied optional field means "cleared" — resolve it to NULL, not undefined.
 *
 * The difference is load-bearing on the edit path: `updateSystem` strips undefined
 * keys so a partial patch can't blank a column it never mentioned. An emptied field
 * that became `undefined` was therefore indistinguishable from "not edited" —
 * clearing a backend link silently did nothing while the UI reported success. null
 * says "explicitly cleared" and survives the strip.
 *
 * The two chains reach null differently, and the asymmetry is deliberate. For a URL
 * `.url()` rejects "", so an emptied field falls through to the literal branch. Notes
 * has no such rejection — "" satisfied the string branch first and stayed "" — so it
 * needs an explicit transform. (A `z.preprocess` would unify them, but it types the
 * schema's INPUT as `unknown`, which breaks the react-hook-form resolver.)
 */

/** Optional URL: emptied = cleared; anything else must be a real URL. */
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .url("Enter a full URL (https://…)")
  .nullish()
  .or(z.literal("").transform(() => null));

/** Same null-not-undefined contract as optionalUrl, so notes can be cleared too. */
const optionalNotes = z
  .string()
  .trim()
  .max(5000)
  .transform((v) => (v === "" ? null : v))
  .nullish();

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
