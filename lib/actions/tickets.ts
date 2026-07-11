"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { STAFF_ROLES } from "@/lib/authz";
import * as q from "@/lib/db/queries";
import type { TicketDetail } from "@/lib/db/queries";
import type { Priority, Status } from "@/lib/db/schema";
import {
  sendClaimNotification,
  sendClosureNotification,
  sendEditNotification,
  sendNewTicketNotification,
  sendReopenNotification,
  sendResolutionNotification,
} from "@/lib/notifications";
import { getCurrentUser, type SessionUser } from "@/lib/session";
import { canTransition } from "@/lib/ticket-state";
import {
  bulkClaimSchema,
  bulkDeleteSchema,
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

  // Ownership lock (§6): a claimed ticket is the assignee's end-to-end — only
  // they change its status. No one else, not even another admin.
  if (ticket.assignedTo && ticket.assignedTo !== user.id) {
    const owner = await q.getUserById(ticket.assignedTo);
    return fail(
      `${ticket.number} is claimed by ${owner?.name ?? owner?.email ?? "another staff member"} — only they can update it.`
    );
  }

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

// There is intentionally NO assignTicket action. Assignment happens only by
// self-claiming an unassigned ticket (claimTicket / bulkClaimTickets), and a
// claimed ticket is locked to its assignee (§6) — manual assign / reassign /
// unassign is deliberately not a feature (it was a way to plant a lock on a
// colleague's behalf or to override the ownership rule).

/**
 * Claim a ticket — a staff member takes ownership, sets the priority + an
 * estimated resolution date, and starts work (§5: OPEN/REOPENED → IN_PROGRESS).
 * Won't steal a ticket already claimed by someone else — once claimed, it stays
 * with its assignee (§6 ownership lock). Notifies the reporter work has started.
 */
/**
 * Core claim logic for a single ticket, shared by claimTicket and
 * bulkClaimTickets. Runs the §5/§6 checks and writes the claim, but does NOT
 * send notifications or revalidate — the caller does that (once, for bulk).
 */
async function claimOne(
  user: SessionUser,
  ticketId: string,
  priority: Priority,
  deadline: string
): Promise<
  | { ok: true; ticketId: string; ticketNumber: string }
  | { ok: false; error: string }
> {
  const ticket = await q.getTicketById(ticketId);
  if (!ticket) return { ok: false, error: "Ticket not found." };

  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") {
    return { ok: false, error: `${ticket.number} is already resolved.` };
  }
  // Ownership lock (§6): never steal a ticket already claimed by someone else —
  // not even as an admin. Once claimed, the assignee owns it end-to-end.
  if (ticket.assignedTo && ticket.assignedTo !== user.id) {
    const current = await q.getUserById(ticket.assignedTo);
    return {
      ok: false,
      error: `${ticket.number} is already claimed by ${current?.name ?? current?.email ?? "another staff member"}.`,
    };
  }
  if (
    ticket.assignedTo === user.id &&
    (ticket.status === "IN_PROGRESS" || ticket.status === "REOPENED")
  ) {
    return { ok: false, error: `You're already working on ${ticket.number}.` };
  }

  // A claim only ever lands on an unassigned ticket or one already mine (the
  // ownership guard above rejects anyone else's), so there is never a prior
  // owner to record. writeAssigned is true only for the first self-claim — it
  // gates the CLAIMED event so re-claiming my own ticket (e.g. after a reopen)
  // doesn't re-log it.
  const writeAssigned = ticket.assignedTo !== user.id;
  const fromAssigneeName: string | null = null;

  const startWork = ticket.status === "OPEN" || ticket.status === "REOPENED";
  await q.claimTicketRow({
    ticketId: ticket.id,
    actorId: user.id,
    actorName: user.name ?? user.email ?? "MIS",
    fromAssigneeName,
    fromStatus: ticket.status,
    fromPriority: ticket.priority,
    priority,
    deadline: new Date(deadline),
    writeAssigned,
    startWork,
  });

  return { ok: true, ticketId: ticket.id, ticketNumber: ticket.number };
}

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

  const res = await claimOne(
    user,
    parsed.data.ticketId,
    parsed.data.priority,
    parsed.data.deadline
  );
  if (!res.ok) return fail(res.error);

  // Tell the reporter their ticket is now being worked on (priority + ETA; §8).
  await sendClaimNotification(res.ticketId);

  revalidateTicketRoutes(res.ticketNumber);
  return ok(undefined);
}

/**
 * Claim several tickets at once — each with its own priority + deadline (bulk
 * triage). Best-effort per ticket: one that fails its checks (already claimed,
 * resolved, …) is reported back without blocking the others (§6).
 */
export async function bulkClaimTickets(input: {
  items: { ticketId: string; priority: string; deadline: string }[];
}): Promise<
  ActionResult<{
    claimed: number;
    failed: { ticketId: string; error: string }[];
  }>
> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can claim tickets.");
  }

  const parsed = bulkClaimSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const claimedIds: string[] = [];
  const failed: { ticketId: string; error: string }[] = [];
  for (const item of parsed.data.items) {
    // Truly best-effort: a transient DB/infra throw on one ticket must not abort
    // the rest (there is no cross-ticket transaction under neon-http anyway).
    try {
      const res = await claimOne(
        user,
        item.ticketId,
        item.priority,
        item.deadline
      );
      if (res.ok) claimedIds.push(res.ticketId);
      else failed.push({ ticketId: item.ticketId, error: res.error });
    } catch (e) {
      console.error("[bulkClaimTickets] failed to claim", item.ticketId, e);
      failed.push({
        ticketId: item.ticketId,
        error: "Something went wrong claiming this ticket.",
      });
    }
  }

  // Notify each reporter (best-effort; §8) after the writes land.
  for (const id of claimedIds) {
    await sendClaimNotification(id);
  }

  if (claimedIds.length > 0) revalidateTicketRoutes();
  return ok({ claimed: claimedIds.length, failed });
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

  // Ownership lock (§6): only the assignee re-prioritises their claimed ticket.
  if (ticket.assignedTo && ticket.assignedTo !== user.id) {
    const owner = await q.getUserById(ticket.assignedTo);
    return fail(
      `${ticket.number} is claimed by ${owner?.name ?? owner?.email ?? "another staff member"} — only they can change it.`
    );
  }

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

/**
 * Soft-delete several tickets at once (row-level multi-select on the table).
 * Best-effort per ticket, applying the same rule as deleteTicket (§6): an
 * MIS_ADMIN can delete any; a reporter only their own still-OPEN ticket. Anything
 * the caller may not delete is skipped and counted as failed. Moves them to the
 * recycle bin (restorable).
 */
export async function bulkDeleteTickets(input: {
  ticketIds: string[];
}): Promise<ActionResult<{ deleted: number; failed: number }>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = bulkDeleteSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const isAdmin = user.role === "MIS_ADMIN";
  let deleted = 0;
  let failed = 0;
  for (const id of parsed.data.ticketIds) {
    try {
      const ticket = await q.getTicketById(id);
      if (!ticket) {
        failed++;
        continue;
      }
      const isReporter = ticket.createdBy === user.id;
      const canDelete = isAdmin || (isReporter && ticket.status === "OPEN");
      if (!canDelete) {
        failed++;
        continue;
      }
      await q.softDeleteTicketById(ticket.id, user.id);
      deleted++;
    } catch (e) {
      console.error("[bulkDeleteTickets] failed to delete", id, e);
      failed++;
    }
  }

  if (deleted > 0) revalidateTicketRoutes();
  return ok({ deleted, failed });
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
