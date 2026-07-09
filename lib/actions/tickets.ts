"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { STAFF_ROLES } from "@/lib/authz";
import * as q from "@/lib/db/queries";
import type { Priority, Status } from "@/lib/db/schema";
import {
  sendAssignmentNotification,
  sendResolutionNotification,
} from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";
import { canTransition } from "@/lib/ticket-state";
import {
  assignTicketSchema,
  createTicketSchema,
  reopenTicketSchema,
  updatePrioritySchema,
  updateStatusSchema,
} from "@/lib/validators/ticket";
import { fail, ok, type ActionResult } from "./result";

function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

function revalidateTicketRoutes(number?: string) {
  revalidatePath("/my");
  revalidatePath("/dashboard");
  revalidatePath("/board");
  if (number) revalidatePath(`/tickets/${number}`);
}

/** Raise a ticket — any authenticated user (§6). */
export async function createTicket(
  input: unknown
): Promise<ActionResult<{ number: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = createTicketSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const ticket = await q.createTicket({ ...parsed.data, createdBy: user.id });
  revalidateTicketRoutes(ticket.number);
  return ok({ number: ticket.number });
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

  revalidateTicketRoutes(ticket.number);
  return ok(undefined);
}
