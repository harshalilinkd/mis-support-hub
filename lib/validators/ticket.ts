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
    .min(4, "Give it a short summary (min 4 characters)")
    .max(160, "Keep the summary under 160 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Describe the issue (min 10 characters)")
    .max(5000),
  department: z.enum(DEPARTMENTS),
  priority: z.enum(PRIORITIES).default("MEDIUM"),
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
  // MIS sets these when they claim: the priority and an estimated resolution
  // date (a "YYYY-MM-DD" string from a date input).
  priority: z.enum(PRIORITIES),
  deadline: z
    .string()
    .trim()
    .min(1, "Pick an estimated resolution date")
    .refine((s) => !Number.isNaN(Date.parse(s)), "Pick a valid date"),
});
export type ClaimTicketInput = z.infer<typeof claimTicketSchema>;

export const deleteTicketSchema = z.object({
  ticketId: z.string().uuid(),
});

/** Editable fields for a ticket (reporter/admin). Priority stays MIS-only (§6). */
export const editTicketSchema = z.object({
  title: z
    .string()
    .trim()
    .min(4, "Give it a short summary (min 4 characters)")
    .max(160, "Keep the summary under 160 characters"),
  description: z
    .string()
    .trim()
    .min(10, "Describe the issue (min 10 characters)")
    .max(5000),
  department: z.enum(DEPARTMENTS),
  sheetLink: z
    .string()
    .trim()
    .url("Must be a valid URL")
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
