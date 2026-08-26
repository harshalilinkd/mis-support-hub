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

export const TICKET_TYPES = ["ISSUE", "REQUEST"] as const;

export const PROGRESS_LOG_TYPES = ["UPDATE", "REVIEW_SESSION", "BLOCKER"] as const;

// Full status set (both machines). The applicable subset is enforced per ticket
// type server-side via statusBelongsToType (lib/ticket-state.ts).
export const STATUSES = [
  // ISSUE (§5)
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
  // REQUEST (§12.3)
  "SUBMITTED",
  "UNDER_REVIEW",
  "PENDING_MD_APPROVAL",
  "APPROVED",
  "DROPPED",
  "CLAIMED",
  "IN_TESTING",
  "CHANGES_REQUESTED",
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
  // Only meaningful when status is RESOLVED: the IST calendar DAY the work was
  // actually finished, so MIS can record a fix they completed a day or two earlier
  // (§5.2). Omitted ⇒ resolved now. A "YYYY-MM-DD" day, never a timestamp; any date is
  // allowed (past or future) — completionDateFor (lib/ticket-state.ts) turns it into the
  // stored instant and refuses only a string that isn't a calendar date.
  resolvedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid resolution date")
    .optional(),
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

/** Undo a claim — the assignee sends their claimed-but-not-started ticket back
 * to the open pool (§5). Assignee-locked in the action; body is just the id. */
export const releaseTicketSchema = z.object({
  ticketId: z.string().uuid(),
});
export type ReleaseTicketInput = z.infer<typeof releaseTicketSchema>;

/** Undo a request claim — the assignee sends their claimed-but-not-started build
 * back to the approved pool (§12.3). Assignee-locked in the action; body is the id. */
export const releaseRequestSchema = z.object({
  ticketId: z.string().uuid(),
});
export type ReleaseRequestInput = z.infer<typeof releaseRequestSchema>;

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
  // The IST calendar DAY the ticket was actually claimed (§5.3). Omitted ⇒ claimed
  // now (bulk claim, board drag). Any day, past or future.
  claimedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid claim date")
    .optional(),
  // Only meaningful alongside `deadline` (the combined claim & start): the day work
  // actually began. Omitted ⇒ now.
  startedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid start date")
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
  // The IST calendar DAY work actually began (§5.3) — MIS often starts a task and only
  // records it later. Omitted ⇒ started now. Any day is allowed, past or future; the
  // shared startDateFor (lib/ticket-state.ts) turns it into the stored instant and
  // refuses only a string that isn't a calendar date.
  startedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid start date")
    .optional(),
});
export type StartTaskInput = z.infer<typeof startTaskSchema>;

/** Resolve several of my claimed tickets in one go — each carries its OWN resolution
 *  date (§5.2). Admin-only in effect: the action applies canResolveIssue per ticket. */
export const bulkResolveSchema = z.object({
  items: z
    .array(
      z.object({
        ticketId: z.string().uuid(),
        resolvedOn: z
          .string()
          .trim()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid resolution date")
          .optional(),
      })
    )
    .min(1, "Select at least one ticket"),
});
export type BulkResolveInput = z.infer<typeof bulkResolveSchema>;

/** Start several claimed tickets in one go — each carries its OWN start date and
 *  deadline (§5.3). No batch-wide date: a backlog being started is precisely where
 *  the days differ per ticket. */
export const bulkStartSchema = z.object({
  items: z.array(startTaskSchema).min(1, "Select at least one ticket"),
});
export type BulkStartInput = z.infer<typeof bulkStartSchema>;

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

/* ------------------------------------------------------------------ *
 * REQUEST ("build me a new system") — intake + workflow (CLAUDE.md §12)
 * ------------------------------------------------------------------ */

// An optional free-text field that normalizes "" → undefined.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : undefined));

/** Request intake — mirrors the request_details brief (§12.2). */
export const createRequestSchema = z.object({
  systemName: z
    .string()
    .trim()
    .min(3, "Name the system (min 3 characters)")
    .max(160, "Keep the name under 160 characters"),
  problemStatement: z
    .string()
    .trim()
    .min(10, "Describe the problem it solves (min 10 characters)")
    .max(5000),
  currentProcess: optionalText(5000),
  currentSheetLink: optionalText(500),
  // No intendedUsers: the requester describes the problem and the benefit; who ends
  // up using the system is a build detail MIS works out with them, not intake.
  expectedBenefit: z
    .string()
    .trim()
    .min(5, "What's the expected benefit?")
    .max(2000),
  // Who ASKED for this system — required at intake so every request records the
  // person/authority it's being raised on behalf of.
  requestedBy: z
    .string()
    .trim()
    .min(2, "Who asked for this system?")
    .max(160, "Keep it under 160 characters"),
  department: z.enum(DEPARTMENTS),
  // No urgency / target date: the requester states the need, MIS sets the priority
  // on claim and the delivery date when they start work (mirrors §5).
});
export type CreateRequestInput = z.infer<typeof createRequestSchema>;

/** A bare transition action (move to review / send for MD approval / revive). */
export const requestActionSchema = z.object({ ticketId: z.string().uuid() });
export type RequestActionInput = z.infer<typeof requestActionSchema>;

/**
 * Move a misfiled ticket to the other module (ISSUE ⇄ REQUEST) (§12).
 * `expectedBenefit` is REQUIRED only when moving an ISSUE → REQUEST (a request must
 * have one; the issue's title/description map to system name / problem statement). A
 * REQUEST → ISSUE move needs no extra field, so it stays optional here and the action
 * enforces the direction-specific rule.
 */
export const moveTicketSchema = z.object({
  ticketId: z.string().uuid(),
  expectedBenefit: z
    .string()
    .trim()
    .min(5, "What's the expected benefit?")
    .max(2000)
    .optional(),
});
export type MoveTicketInput = z.infer<typeof moveTicketSchema>;

/** MD decision — an offline verdict RECORDED BY AN MIS_ADMIN on the MD's behalf
 *  (§12.2). There is no MD role and the MD never logs in. */
export const mdDecisionSchema = z.object({
  ticketId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REJECTED"]),
  // Optional even on reject (§12.2).
  remark: optionalText(2000),
});
export type MdDecisionInput = z.infer<typeof mdDecisionSchema>;

/** Claim a REQUEST for the build — sets assignee + priority + delivery deadline. */
export const claimRequestSchema = z.object({
  ticketId: z.string().uuid(),
  // Claim sets ownership + priority only — the delivery date comes at start-work.
  priority: z.enum(PRIORITIES),
  // The IST calendar DAY the build was actually claimed (§5.3), mirroring the ISSUE
  // claim. Omitted ⇒ claimed now. Any day, past or future.
  claimedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid claim date")
    .optional(),
});
export type ClaimRequestInput = z.infer<typeof claimRequestSchema>;

/** Start the build — the assignee commits to a delivery date (§12.3, mirrors §5). */
export const startWorkSchema = z.object({
  ticketId: z.string().uuid(),
  deadline: z
    .string()
    .trim()
    .min(1, "Pick a delivery date")
    .refine((s) => !Number.isNaN(Date.parse(s)), "Pick a valid date"),
  // The IST calendar DAY the build actually began (§5.3) — the request twin of
  // startTaskSchema.startedOn. Omitted ⇒ started now. Any day, past or future.
  startedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid start date")
    .optional(),
});
export type StartWorkInput = z.infer<typeof startWorkSchema>;

/** Change the delivery deadline on an in-flight request. Audited + the requester is
 *  notified — a deadline move is never silent (P12). */
export const updateDeadlineSchema = z.object({
  ticketId: z.string().uuid(),
  deadline: z
    .string()
    .trim()
    .min(1, "Pick a delivery date")
    .refine((s) => !Number.isNaN(Date.parse(s)), "Pick a valid date"),
});
export type UpdateDeadlineInput = z.infer<typeof updateDeadlineSchema>;

/** Add a progress log during the build (§12.2). */
export const progressLogSchema = z.object({
  ticketId: z.string().uuid(),
  type: z.enum(PROGRESS_LOG_TYPES),
  body: z.string().trim().min(1, "Add a note").max(5000),
  percentComplete: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(0).max(100).optional()
  ),
});
export type ProgressLogInput = z.infer<typeof progressLogSchema>;

/** MIS marks the build complete → hands to the requester for UAT (→ IN_TESTING). */
export const markCompleteSchema = z.object({
  ticketId: z.string().uuid(),
  note: optionalText(2000),
  // The IST day the build was actually finished (§5.2) — the request-side twin of
  // updateStatusSchema.resolvedOn. Omitted ⇒ completed now. Any day is allowed; the
  // shared completionDateFor only refuses a string that isn't a calendar date.
  completedOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid completion date")
    .optional(),
});
export type MarkCompleteInput = z.infer<typeof markCompleteSchema>;

/** Requester asks for changes during UAT (→ CHANGES_REQUESTED, revision_round++). */
export const requestChangesSchema = z.object({
  ticketId: z.string().uuid(),
  body: z
    .string()
    .trim()
    .min(3, "Tell the team what needs to change")
    .max(5000),
});
export type RequestChangesInput = z.infer<typeof requestChangesSchema>;

/** Requester accepts the build → CLOSED (only the requester's acceptance closes). */
export const acceptRequestSchema = z.object({ ticketId: z.string().uuid() });
export type AcceptRequestInput = z.infer<typeof acceptRequestSchema>;
