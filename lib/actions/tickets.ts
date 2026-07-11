"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { STAFF_ROLES } from "@/lib/authz";
import * as q from "@/lib/db/queries";
import type { TicketDetail } from "@/lib/db/queries";
import type { Priority, Status } from "@/lib/db/schema";
import {
  sendAssignmentNotification,
  sendClaimNotification,
  sendClosureNotification,
  sendEditNotification,
  sendNewTicketNotification,
  sendReopenNotification,
  sendResolutionNotification,
} from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";
import { canTransition } from "@/lib/ticket-state";
import {
  assignTicketSchema,
  claimTicketSchema,
  createTicketSchema,
  deleteTicketSchema,
  reopenTicketSchema,
  updatePrioritySchema,
  updateStatusSchema,
  updateTicketSchema,
} from "@/lib/validators/ticket";
import { fail, ok, type ActionResult } from "./result";

function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function revalidateTicketRoutes(number?: string) {
  revalidatePath("/my");
  revalidatePath("/dashboard");
  revalidatePath("/tickets");
  revalidatePath("/board");
  revalidatePath("/settings/recycle-bin");
  if (number) revalidatePath(`/tickets/${number}`);
}

/** Raise a ticket — any authenticated user (§6). */
export async function createTicket(
  input: unknown
): Promise<ActionResult<{ id: string; number: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.createTicket({ ...parsed.data, createdBy: user.id });
  // Alert the MIS team that a new ticket needs triage (§8; best-effort).
  await sendNewTicketNotification(ticket.id);
  revalidateTicketRoutes(ticket.number);
  // id is returned so the caller can link freshly-uploaded attachments (attachTo).
  return ok({ id: ticket.id, number: ticket.number });
}

/** Change status — MIS only, enforcing the §5 state machine. */
export async function updateStatus(
  ticketId: string,
  status: Status
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can change a ticket's status.");
  }

  const parsed = updateStatusSchema.safeParse({ ticketId, status });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");

  const from = ticket.status;
  const to = parsed.data.status;
  if (from === to) return fail(`Ticket is already ${to}.`);
  if (!canTransition(from, to)) {
    return fail(`Can't change status from ${from} to ${to}.`);
  }
  if (to === "RESOLVED" && !ticket.assignedTo) {
    return fail("Assign the ticket before marking it resolved.");
  }

  await q.setTicketStatus({
    ticketId: ticket.id,
    actorId: user.id,
    from,
    to,
    ...(to === "RESOLVED" ? { resolvedAt: new Date(), resolvedBy: user.id } : {}),
  });

  // Notify the reporter when resolved/closed (§8; best-effort, never throws).
  if (to === "RESOLVED" || to === "CLOSED") {
    await sendResolutionNotification(ticket.id);
  }

  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/** Assign/unassign — MIS only. */
export async function assignTicket(
  ticketId: string,
  assigneeId: string | null
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can assign tickets.");
  }

  const parsed = assignTicketSchema.safeParse({ ticketId, assigneeId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");

  // No-op guard (mirrors updateStatus/setPriority): don't write a spurious
  // ASSIGNED activity row or re-fire the notification when nothing changes.
  if ((ticket.assignedTo ?? null) === (parsed.data.assigneeId ?? null)) {
    return fail(
      parsed.data.assigneeId
        ? "Ticket is already assigned to that person."
        : "Ticket is already unassigned."
    );
  }

  let toName: string | null = null;
  if (parsed.data.assigneeId) {
    const assignee = await q.getUserById(parsed.data.assigneeId);
    if (!assignee || !assignee.isActive) {
      return fail("That assignee doesn't exist or is inactive.");
    }
    if (!STAFF_ROLES.includes(assignee.role)) {
      return fail("Tickets can only be assigned to MIS staff.");
    }
    toName = assignee.name ?? assignee.email;
  }

  const fromUser = ticket.assignedTo
    ? await q.getUserById(ticket.assignedTo)
    : null;

  await q.setTicketAssignee({
    ticketId: ticket.id,
    actorId: user.id,
    assigneeId: parsed.data.assigneeId,
    fromName: fromUser?.name ?? fromUser?.email ?? null,
    toName,
  });

  if (parsed.data.assigneeId) {
    await sendAssignmentNotification(ticket.id);
  }

  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/**
 * Claim a ticket — a staff member takes ownership, sets the priority + an
 * estimated resolution date, and starts work (§5: OPEN/REOPENED → IN_PROGRESS).
 * Won't steal a ticket already claimed by someone else (an MIS_ADMIN may take it
 * over). Notifies the reporter that work has started.
 */
export async function claimTicket(input: {
  ticketId: string;
  priority: string;
  deadline: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can claim tickets.");
  }

  const parsed = claimTicketSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");

  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
    return fail("This ticket is already resolved — there's nothing to claim.");
  }
  if (
    ticket.assignedTo &&
    ticket.assignedTo !== user.id &&
    user.role !== "MIS_ADMIN"
  ) {
    const current = await q.getUserById(ticket.assignedTo);
    return fail(
      `Already claimed by ${current?.name ?? current?.email ?? "another staff member"}.`
    );
  }
  if (
    ticket.assignedTo === user.id &&
    (ticket.status === "IN_PROGRESS" || ticket.status === "REOPENED")
  ) {
    return fail("You're already working on this ticket.");
  }

  // Only log an ASSIGNED event when ownership actually changes; for an admin
  // take-over, capture the prior owner so the audit trail stays complete.
  const writeAssigned = ticket.assignedTo !== user.id;
  let fromAssigneeName: string | null = null;
  if (writeAssigned && ticket.assignedTo) {
    const prev = await q.getUserById(ticket.assignedTo);
    fromAssigneeName = prev?.name ?? prev?.email ?? null;
  }

  const startWork = ticket.status === "OPEN" || ticket.status === "REOPENED";
  await q.claimTicketRow({
    ticketId: ticket.id,
    actorId: user.id,
    actorName: user.name ?? user.email ?? "MIS",
    fromAssigneeName,
    fromStatus: ticket.status,
    fromPriority: ticket.priority,
    priority: parsed.data.priority,
    deadline: new Date(parsed.data.deadline),
    writeAssigned,
    startWork,
  });

  // Tell the reporter their ticket is now being worked on (priority + ETA; §8).
  await sendClaimNotification(ticket.id);

  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/** Change priority — MIS only. */
export async function setPriority(
  ticketId: string,
  priority: Priority
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can change priority.");
  }

  const parsed = updatePrioritySchema.safeParse({ ticketId, priority });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");
  if (ticket.priority === parsed.data.priority) {
    return fail(`Priority is already ${parsed.data.priority}.`);
  }

  await q.setTicketPriority({
    ticketId: ticket.id,
    actorId: user.id,
    from: ticket.priority,
    to: parsed.data.priority,
  });

  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/** Reopen — reporter or MIS_ADMIN only; RESOLVED → REOPENED (§5). */
export async function reopenTicket(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = reopenTicketSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");

  const isReporter = ticket.createdBy === user.id;
  const isAdmin = user.role === "MIS_ADMIN";
  if (!isReporter && !isAdmin) {
    return fail("Only the reporter or an MIS admin can reopen a ticket.");
  }
  if (ticket.status !== "RESOLVED") {
    return fail("Only a resolved ticket can be reopened.");
  }

  await q.reopenTicketRow({
    ticketId: ticket.id,
    actorId: user.id,
    from: ticket.status,
  });

  // Tell the assigned MIS member their ticket is active again — it stays with
  // them and returns to their In Progress list (§ workflow; best-effort, §8).
  await sendReopenNotification(ticket.id);

  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/**
 * Confirm a resolved ticket — the reporter (or MIS_ADMIN) accepts the fix, which
 * permanently CLOSES it (§ workflow: it can't be reopened after this). Notifies
 * the assigned MIS member that the reporter confirmed and the ticket is closed.
 */
export async function confirmResolved(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = reopenTicketSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");

  const isReporter = ticket.createdBy === user.id;
  const isAdmin = user.role === "MIS_ADMIN";
  if (!isReporter && !isAdmin) {
    return fail("Only the reporter or an MIS admin can confirm a ticket.");
  }
  if (ticket.status !== "RESOLVED") {
    return fail("Only a resolved ticket can be confirmed.");
  }

  await q.setTicketStatus({
    ticketId: ticket.id,
    actorId: user.id,
    from: "RESOLVED",
    to: "CLOSED",
  });

  await sendClosureNotification(
    ticket.id,
    user.name ?? user.email ?? "The reporter"
  );

  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/** Edit a ticket's own fields — reporter or MIS_ADMIN, while not CLOSED. */
export async function updateTicket(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = updateTicketSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");

  const isReporter = ticket.createdBy === user.id;
  const isAdmin = user.role === "MIS_ADMIN";
  if (!isReporter && !isAdmin) {
    return fail("You can only edit your own tickets.");
  }
  if (ticket.status === "CLOSED") {
    return fail("A closed ticket can't be edited.");
  }

  // No-op guard: if nothing actually changed, don't record an activity row or
  // notify anyone (§ workflow: no notification when the edit form is opened and
  // closed without a real change).
  const nextSheet = parsed.data.sheetLink ?? null;
  const unchanged =
    ticket.title === parsed.data.title &&
    ticket.description === parsed.data.description &&
    ticket.department === parsed.data.department &&
    (ticket.sheetLink ?? null) === nextSheet;
  if (unchanged) return ok(undefined);

  await q.updateTicketFields({
    ticketId: ticket.id,
    actorId: user.id,
    title: parsed.data.title,
    description: parsed.data.description,
    department: parsed.data.department,
    sheetLink: nextSheet,
  });

  // Tell the assigned MIS member the reporter added/changed details (§ workflow;
  // in-app only). Only for the reporter's own edits, and only when assigned.
  if (isReporter && ticket.assignedTo) {
    await sendEditNotification(ticket.id);
  }

  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/**
 * Delete a ticket → move it to the recycle bin (soft delete). The reporter may
 * withdraw their own ticket while it's still OPEN; MIS_ADMIN may bin any ticket.
 * It vanishes from every list but can be restored (or permanently deleted) by an
 * admin from the recycle bin.
 */
export async function deleteTicket(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = deleteTicketSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");

  const isReporter = ticket.createdBy === user.id;
  const isAdmin = user.role === "MIS_ADMIN";
  const canDelete = isAdmin || (isReporter && ticket.status === "OPEN");
  if (!canDelete) {
    return fail(
      isReporter
        ? "You can only delete a ticket while it's still open."
        : "Only the reporter or an MIS admin can delete this ticket."
    );
  }

  await q.softDeleteTicketById(ticket.id, user.id);
  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/** Restore a ticket from the recycle bin — MIS_ADMIN only. */
export async function restoreTicket(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (user.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can manage the recycle bin.");
  }

  const parsed = deleteTicketSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getDeletedTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found in the recycle bin.");

  await q.restoreTicketById(ticket.id);
  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/**
 * Permanently delete a ticket from the recycle bin — MIS_ADMIN only. Irreversible:
 * the row (and its comments, attachments, activity, notifications) are dropped.
 * Only works on a ticket that's already in the bin.
 */
export async function permanentlyDeleteTicket(
  ticketId: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (user.role !== "MIS_ADMIN") {
    return fail("Only MIS admins can manage the recycle bin.");
  }

  const parsed = deleteTicketSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.getDeletedTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found in the recycle bin.");

  await q.deleteTicketById(ticket.id);
  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}

/**
 * Read the full ticket detail for the current viewer (§6 visibility enforced by
 * getTicketByNumber). Used to hydrate the detail Sheet on demand from lists.
 */
export async function loadTicketDetail(
  number: string
): Promise<ActionResult<TicketDetail>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  const ticket = await q.getTicketByNumber(number, {
    id: user.id,
    role: user.role,
  });
  if (!ticket) return fail("Ticket not found.");
  return ok(ticket);
}
