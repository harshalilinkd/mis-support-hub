import { z } from "zod";

/**
 * These const tuples mirror the DB enums in lib/db/schema.ts, but are kept
 * independent so validators can be imported into client components (forms)
 * without pulling the DB driver into the client bundle.
 */
export const DEPARTMENTS = [
  "LINKD",
  "LD_SILK_MILLS",
  "VHAGAR",
  "LD_COTTON_MILLS",
] as const;

export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
] as const;

export const DEPARTMENT_LABELS: Record<(typeof DEPARTMENTS)[number], string> = {
  LINKD: "LINKD",
  LD_SILK_MILLS: "LD Silk Mills",
  VHAGAR: "VHAGAR",
  LD_COTTON_MILLS: "LD Cotton Mills",
};

export const createTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(4, "Give it a short subject (min 4 characters)")
    .max(160, "Keep the subject under 160 characters"),
  // Optional — the raise form accepts a voice note instead of typed text, so a
  // voice-only ticket has no description and must stay valid/editable.
  description: z.string().trim().max(5000),
  department: z.enum(DEPARTMENTS),
  // No priority here — a raised ticket is unprioritized; MIS sets it on claim.
  // Required, but not necessarily a URL — a sheet/app link OR just the system
  // name (e.g. "Data entry Interface") is accepted.
  sheetLink: z
    .string()
    .trim()
    .min(1, "Add a sheet link, web app URL, or the system name")
    .max(500),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const updateStatusSchema = z.object({
  ticketId: z.string().uuid(),
  status: z.enum(STATUSES),
});
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

export const assignTicketSchema = z.object({
  ticketId: z.string().uuid(),
  assigneeId: z.string().uuid().nullable(),
});
export type AssignTicketInput = z.infer<typeof assignTicketSchema>;

export const updatePrioritySchema = z.object({
  ticketId: z.string().uuid(),
  priority: z.enum(PRIORITIES),
});
export type UpdatePriorityInput = z.infer<typeof updatePrioritySchema>;

export const reopenTicketSchema = z.object({
  ticketId: z.string().uuid(),
});
export type ReopenTicketInput = z.infer<typeof reopenTicketSchema>;

export const claimTicketSchema = z.object({
  ticketId: z.string().uuid(),
  // On claim, MIS sets only the priority — the ticket stays OPEN and is assigned
  // to them; the deadline is set later, when they Start the task (§5).
  priority: z.enum(PRIORITIES),
  // Optional: a plain claim omits it (ticket stays OPEN). When present, it's the
  // combined "claim & start" shortcut (board drag / status dropdown), which also
  // starts work → IN_PROGRESS. A "YYYY-MM-DD" string from a date input.
  deadline: z
    .string()
    .trim()
    .min(1, "Pick a valid date")
    .refine((s) => !Number.isNaN(Date.parse(s)), "Pick a valid date")
    .optional(),
});
export type ClaimTicketInput = z.infer<typeof claimTicketSchema>;

/** Start work on a claimed ticket — set the expected completion date (§5). */
export const startTaskSchema = z.object({
  ticketId: z.string().uuid(),
  deadline: z
    .string()
    .trim()
    .min(1, "Pick an expected completion date")
    .refine((s) => !Number.isNaN(Date.parse(s)), "Pick a valid date"),
});
export type StartTaskInput = z.infer<typeof startTaskSchema>;

/** Claim several tickets in one go — each carries its own priority (stays OPEN). */
export const bulkClaimSchema = z.object({
  items: z.array(claimTicketSchema).min(1, "Select at least one ticket"),
});
export type BulkClaimInput = z.infer<typeof bulkClaimSchema>;

export const deleteTicketSchema = z.object({
  ticketId: z.string().uuid(),
});

/** Soft-delete several tickets at once (row-level multi-select on the table). */
export const bulkDeleteSchema = z.object({
  ticketIds: z.array(z.string().uuid()).min(1, "Select at least one ticket"),
});
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;

/** Editable fields for a ticket (reporter/admin). Priority stays MIS-only (§6). */
export const editTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(4, "Give it a short subject (min 4 characters)")
    .max(160, "Keep the subject under 160 characters"),
  // Optional — the raise form accepts a voice note instead of typed text, so a
  // voice-only ticket has no description and must stay valid/editable.
  description: z.string().trim().max(5000),
  department: z.enum(DEPARTMENTS),
  // Not necessarily a URL — a sheet/app link OR just the system name is fine
  // (mirrors the raise form, so a ticket saved with a system name stays editable).
  sheetLink: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined)),
});
export type EditTicketInput = z.infer<typeof editTicketSchema>;

export const updateTicketSchema = editTicketSchema.extend({
  ticketId: z.string().uuid(),
});
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;

/** Filters for list views (parsed from query params in the UI phases). */
export const ticketFiltersSchema = z.object({
  status: z.enum(STATUSES).optional(),
  priority: z.enum(PRIORITIES).optional(),
  department: z.enum(DEPARTMENTS).optional(),
  assigneeId: z.union([z.string().uuid(), z.literal("unassigned")]).optional(),
  search: z.string().trim().max(200).optional(),
});
export type TicketFiltersInput = z.infer<typeof ticketFiltersSchema>;
