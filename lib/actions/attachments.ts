"use server";

import { revalidatePath } from "next/cache";

import { STAFF_ROLES } from "@/lib/authz";
import type { AttachmentMeta } from "@/lib/attachments";
import * as q from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/session";
import { attachToSchema } from "@/lib/validators/attachment";
import { fail, ok, type ActionResult } from "./result";

/**
 * Persist an uploaded Blob (already in storage via /api/upload) to
 * ticket_attachments. The uploader must be able to view the ticket (§6).
 * Does not modify the ticket or P3 actions.
 */
export async function attachTo(
  ticketId: string,
  commentId: string | null,
  meta: AttachmentMeta
): Promise<ActionResult<{ id: string; url: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = attachToSchema.safeParse({ ticketId, commentId, ...meta });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Invalid attachment.");
  }

  const ticket = await q.getTicketById(parsed.data.ticketId);
  if (!ticket) return fail("Ticket not found.");

  // Row-level visibility (§6): USER may only attach to their own tickets.
  const canView =
    STAFF_ROLES.includes(user.role) || ticket.createdBy === user.id;
  if (!canView) return fail("You don't have access to this ticket.");

  const attachment = await q.addAttachment({
    ticketId: ticket.id,
    commentId: parsed.data.commentId ?? null,
    url: parsed.data.url,
    filename: parsed.data.filename,
    contentType: parsed.data.contentType,
    sizeBytes: parsed.data.sizeBytes,
    uploadedBy: user.id,
  });

  revalidatePath(`/tickets/${ticket.number}`);
  return ok({ id: attachment.id, url: attachment.url });
}
