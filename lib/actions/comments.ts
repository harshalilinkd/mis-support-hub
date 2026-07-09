"use server";

import { revalidatePath } from "next/cache";

import { STAFF_ROLES } from "@/lib/authz";
import * as q from "@/lib/db/queries";
import { sendCommentNotification } from "@/lib/notifications";
import { getCurrentUser } from "@/lib/session";
import { createCommentSchema } from "@/lib/validators/comment";
import { fail, ok, type ActionResult } from "./result";

/** Comment on a ticket the user can view (§6). Writes COMMENTED activity. */
export async function addComment(
  ticketId: string,
  body: string
): Promise<ActionResult<{ id: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = createCommentSchema.safeParse({ ticketId, body });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid comment.");
  }

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");

  // Row-level visibility (§6): USER may only comment on their own tickets.
  const canView =
    STAFF_ROLES.includes(user.role) || ticket.createdBy === user.id;
  if (!canView) return fail("You don't have access to this ticket.");

  const comment = await q.addTicketComment({
    ticketId: ticket.id,
    authorId: user.id,
    body: parsed.data.body,
  });

  // In-app notify the other party (§8; best-effort, never throws).
  await sendCommentNotification(ticket.id, user.id);

  revalidatePath(`/tickets/${ticket.number}`);
  return ok({ id: comment.id });
}
