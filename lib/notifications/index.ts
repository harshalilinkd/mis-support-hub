import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { tickets, users } from "@/lib/db/schema";
import { emailProvider } from "./email";
import type { NotificationChannel, NotificationProvider, NotifyInput } from "./types";
import { whatsappProvider } from "./whatsapp";

export type { NotifyInput } from "./types";

const providers: Partial<Record<NotificationChannel, NotificationProvider>> = {
  email: emailProvider,
  whatsapp: whatsappProvider,
};

/**
 * Channel-agnostic dispatch (CLAUDE.md §8). All sends are best-effort:
 * failures are logged and swallowed — a notification never rolls back a
 * DB mutation or throws to the caller.
 */
export async function notify(
  input: NotifyInput,
  channels: Array<Exclude<NotificationChannel, "in_app">> = ["email"]
): Promise<void> {
  const results = await Promise.allSettled(
    channels.map((channel) => {
      const provider = providers[channel];
      if (!provider) {
        return Promise.resolve({ ok: false, error: `no provider: ${channel}` });
      }
      return provider.send(input);
    })
  );

  results.forEach((result, index) => {
    const channel = channels[index];
    if (result.status === "rejected") {
      console.error(`[notify] ${channel} threw`, result.reason);
    } else if (!result.value.ok) {
      console.warn(`[notify] ${channel} failed: ${result.value.error}`);
    }
  });
}

async function loadTicket(ticketId: string) {
  const [row] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, ticketId))
    .limit(1);
  return row ?? null;
}

async function loadUser(id: string | null | undefined) {
  if (!id) return null;
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

const appUrl = () => process.env.NEXT_PUBLIC_APP_URL ?? "";

/** Status → RESOLVED/CLOSED: email the reporter to verify (CLAUDE.md §8). */
export async function sendResolutionNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    if (!reporter?.email) return;
    const resolver = await loadUser(ticket.resolvedBy);
    await notify({
      to: { email: reporter.email, name: reporter.name },
      template: "TICKET_RESOLVED",
      data: {
        number: ticket.number,
        title: ticket.title,
        resolvedBy: resolver?.name ?? "the MIS team",
        appUrl: appUrl(),
      },
    });
  } catch (e) {
    console.error("[sendResolutionNotification]", e);
  }
}

/** Ticket assigned: email the assignee (CLAUDE.md §8). */
export async function sendAssignmentNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const assignee = await loadUser(ticket.assignedTo);
    if (!assignee?.email) return;
    await notify({
      to: { email: assignee.email, name: assignee.name },
      template: "TICKET_ASSIGNED",
      data: {
        number: ticket.number,
        title: ticket.title,
        appUrl: appUrl(),
      },
    });
  } catch (e) {
    console.error("[sendAssignmentNotification]", e);
  }
}

/**
 * New comment → notify the "other party" (CLAUDE.md §8): if the actor is the
 * reporter, notify the assignee; otherwise notify the reporter. In-app only —
 * email is intentionally off by default for comments. Real delivery lands in P8.
 */
export async function sendCommentNotification(
  ticketId: string,
  actorId: string
): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const otherId =
      actorId === ticket.createdBy ? ticket.assignedTo : ticket.createdBy;
    if (!otherId || otherId === actorId) return;
    // In-app notification (no persistent store yet — surfaced via the activity
    // feed + client toast in the UI phases). Email stays off by default (§8).
    console.info(
      `[notifications:in-app] new comment on ${ticket.number} → notify user ${otherId}`
    );
  } catch (e) {
    console.error("[sendCommentNotification]", e);
  }
}
