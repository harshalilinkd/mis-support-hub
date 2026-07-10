import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { createNotification } from "@/lib/db/queries";
import { type NotificationType, tickets, users } from "@/lib/db/schema";
import { emailProvider } from "./email";
import type {
  NotificationChannel,
  NotificationProvider,
  NotifyInput,
} from "./types";
import { whatsappProvider } from "./whatsapp";

export type { NotifyInput } from "./types";

const providers: Partial<Record<NotificationChannel, NotificationProvider>> = {
  email: emailProvider,
  whatsapp: whatsappProvider,
};

/**
 * Channel-agnostic dispatch (CLAUDE.md §8). All sends are best-effort: failures
 * are logged and swallowed — a notification never rolls back a DB mutation or
 * throws to the caller.
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

/** Persist an in-app notification (best-effort). */
async function createInApp(args: {
  userId: string;
  type: NotificationType;
  ticketId: string;
  ticketNumber: string;
  title: string;
  body?: string;
}): Promise<void> {
  try {
    await createNotification(args);
  } catch (e) {
    console.error("[notifications:in-app] failed", e);
  }
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

function formatDeadline(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** "HIGH" → "High" */
function priorityLabel(p: string): string {
  return p.charAt(0) + p.slice(1).toLowerCase();
}

/** Status → RESOLVED/CLOSED: notify the reporter to verify (in-app + email; §8). */
export async function sendResolutionNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    if (!reporter) return;
    const resolver = await loadUser(ticket.resolvedBy);
    const resolverName = resolver?.name ?? "the MIS team";

    await createInApp({
      userId: reporter.id,
      type: "TICKET_RESOLVED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `Issue ${ticket.number} was resolved`,
      body: `Resolved by ${resolverName}. Please verify.`,
    });

    if (reporter.email) {
      await notify({
        to: { email: reporter.email, name: reporter.name },
        template: "TICKET_RESOLVED",
        data: {
          number: ticket.number,
          title: ticket.title,
          resolvedBy: resolverName,
          appUrl: appUrl(),
        },
      });
    }
  } catch (e) {
    console.error("[sendResolutionNotification]", e);
  }
}

/** Ticket assigned: notify the assignee (in-app + email; §8). */
export async function sendAssignmentNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const assignee = await loadUser(ticket.assignedTo);
    if (!assignee) return;

    await createInApp({
      userId: assignee.id,
      type: "TICKET_ASSIGNED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `Ticket ${ticket.number} assigned to you`,
      body: ticket.title,
    });

    if (assignee.email) {
      await notify({
        to: { email: assignee.email, name: assignee.name },
        template: "TICKET_ASSIGNED",
        data: {
          number: ticket.number,
          title: ticket.title,
          appUrl: appUrl(),
        },
      });
    }
  } catch (e) {
    console.error("[sendAssignmentNotification]", e);
  }
}

/**
 * Ticket claimed by MIS: tell the reporter their ticket is now being worked on,
 * with the priority the MIS member set and the estimated resolution date (§8).
 */
export async function sendClaimNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    if (!reporter) return;
    const worker = await loadUser(ticket.assignedTo);
    const workerName = worker?.name ?? "The MIS team";
    const prio = priorityLabel(ticket.priority);
    const eta = ticket.deadline ? formatDeadline(ticket.deadline) : null;

    await createInApp({
      userId: reporter.id,
      type: "TICKET_CLAIMED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `${workerName} started working on ${ticket.number}`,
      body: eta
        ? `Priority: ${prio}. Expected resolution by ${eta}.`
        : `Priority: ${prio}. Work has started.`,
    });

    if (reporter.email) {
      await notify({
        to: { email: reporter.email, name: reporter.name },
        template: "TICKET_CLAIMED",
        data: {
          number: ticket.number,
          title: ticket.title,
          claimedBy: workerName,
          priority: prio,
          deadline: eta ?? "",
          appUrl: appUrl(),
        },
      });
    }
  } catch (e) {
    console.error("[sendClaimNotification]", e);
  }
}

/**
 * New comment → notify the "other party" (CLAUDE.md §8): if the actor is the
 * reporter, notify the assignee; otherwise notify the reporter. In-app only —
 * email is intentionally off by default for comments.
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
    const actor = await loadUser(actorId);

    await createInApp({
      userId: otherId,
      type: "NEW_COMMENT",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `New comment on ${ticket.number}`,
      body: `${actor?.name ?? "Someone"} commented on “${ticket.title}”.`,
    });
  } catch (e) {
    console.error("[sendCommentNotification]", e);
  }
}
