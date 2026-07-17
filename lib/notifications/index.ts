import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  createNotification,
  getRequestDetailsRow,
  listAdmins,
  listAssignableUsers,
} from "@/lib/db/queries";
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
      body: `${ticket.title}\nResolved by ${resolverName}. Please verify.`,
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
    const prio = ticket.priority ? priorityLabel(ticket.priority) : "Unset";
    const eta = ticket.deadline ? formatDeadline(ticket.deadline) : null;

    await createInApp({
      userId: reporter.id,
      type: "TICKET_CLAIMED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `${workerName} started working on ${ticket.number}`,
      body: eta
        ? `${ticket.title}\nPriority: ${prio}. Expected resolution by ${eta}.`
        : `${ticket.title}\nPriority: ${prio}. Work has started.`,
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
 * Ticket reopened by the reporter: tell the assigned MIS member it's active again
 * and back in their In Progress list (§ workflow; in-app + email; §8).
 */
export async function sendReopenNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const worker = await loadUser(ticket.assignedTo);
    if (!worker) return;
    const reporter = await loadUser(ticket.createdBy);
    const who = reporter?.name ?? "The reporter";

    await createInApp({
      userId: worker.id,
      type: "TICKET_REOPENED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `${ticket.number} was reopened`,
      body: `${ticket.title}\n${who} reopened this — it's back in your In Progress list.`,
    });

    if (worker.email) {
      await notify({
        to: { email: worker.email, name: worker.name },
        template: "TICKET_REOPENED",
        data: { number: ticket.number, title: ticket.title, appUrl: appUrl() },
      });
    }
  } catch (e) {
    console.error("[sendReopenNotification]", e);
  }
}

/**
 * Reporter confirmed the fix: tell the assigned MIS member the ticket is now
 * closed for good (§ workflow; in-app + email; §8).
 */
export async function sendClosureNotification(
  ticketId: string,
  closedByName: string
): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const worker = await loadUser(ticket.assignedTo);
    if (!worker) return;

    await createInApp({
      userId: worker.id,
      type: "TICKET_CLOSED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `${ticket.number} confirmed resolved & closed`,
      body: `${ticket.title}\n${closedByName} confirmed the fix. The ticket is now closed.`,
    });

    if (worker.email) {
      await notify({
        to: { email: worker.email, name: worker.name },
        template: "TICKET_CLOSED",
        data: {
          number: ticket.number,
          title: ticket.title,
          closedBy: closedByName,
          appUrl: appUrl(),
        },
      });
    }
  } catch (e) {
    console.error("[sendClosureNotification]", e);
  }
}

/**
 * Reporter added/changed details after MIS started: tell the assigned MIS member
 * so they see the new info. In-app only (like comments) to avoid email noise; the
 * caller only fires this for a real change (§ workflow).
 */
export async function sendEditNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const worker = await loadUser(ticket.assignedTo);
    if (!worker) return;
    const reporter = await loadUser(ticket.createdBy);

    await createInApp({
      userId: worker.id,
      type: "TICKET_UPDATED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `${ticket.number} was updated by the reporter`,
      body: `${ticket.title}\n${reporter?.name ?? "The reporter"} added or changed details.`,
    });
  } catch (e) {
    console.error("[sendEditNotification]", e);
  }
}

/**
 * New ticket raised: alert the whole MIS team (in-app) so it gets triaged. The
 * reporter is skipped if they happen to be staff. Best-effort (§8).
 */
export async function sendNewTicketNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    const who = reporter?.name ?? "Someone";
    const staff = await listAssignableUsers();
    // Fan out to the whole MIS team in parallel (best-effort; §8).
    await Promise.all(
      staff
        .filter((s) => s.id !== ticket.createdBy)
        .map((s) =>
          createInApp({
            userId: s.id,
            type: "NEW_TICKET",
            ticketId: ticket.id,
            ticketNumber: ticket.number,
            title: `New ticket ${ticket.number}`,
            body: `${ticket.title}\nRaised by ${who} — needs triage.`,
          })
        )
    );
  } catch (e) {
    console.error("[sendNewTicketNotification]", e);
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

/* ------------------------------------------------------------------ *
 * REQUEST notifications (CLAUDE.md §12.6). Reuse createInApp — in-app is the
 * persisted channel that drives the bell; all best-effort (§8).
 * ------------------------------------------------------------------ */

/** Fan out one in-app notice to every active MIS member (best-effort). */
async function notifyTeam(
  ticket: { id: string; number: string; title: string; createdBy: string },
  type: NotificationType,
  title: string,
  body: string,
  {
    skipReporter = true,
    skipUserId,
  }: { skipReporter?: boolean; skipUserId?: string | null } = {}
): Promise<void> {
  const staff = await listAssignableUsers();
  await Promise.all(
    staff
      // `skipUserId` avoids double-notifying someone who already got a tailored
      // notice (e.g. the assignee on REQUEST_ACCEPTED).
      .filter((s) => s.id !== skipUserId)
      .filter((s) => !skipReporter || s.id !== ticket.createdBy)
      .map((s) =>
        createInApp({
          userId: s.id,
          type,
          ticketId: ticket.id,
          ticketNumber: ticket.number,
          title,
          body,
        })
      )
  );
}

/** New request submitted → the whole MIS team (needs review). */
export async function sendRequestSubmittedNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    const who = reporter?.name ?? "Someone";
    await notifyTeam(
      ticket,
      "REQUEST_SUBMITTED",
      `New request ${ticket.number}`,
      `${ticket.title}\nSubmitted by ${who} — needs review.`
    );
  } catch (e) {
    console.error("[sendRequestSubmittedNotification]", e);
  }
}

/** Sent for approval → the MIS admins (they record the MD's offline decision; §12.6). */
export async function sendRequestPendingApprovalNotification(
  ticketId: string
): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const admins = await listAdmins();
    await Promise.all(
      admins.map((a) =>
        createInApp({
          userId: a.id,
          type: "REQUEST_PENDING_APPROVAL",
          ticketId: ticket.id,
          ticketNumber: ticket.number,
          title: `${ticket.number} is awaiting approval`,
          body: `${ticket.title}\nConfirm with the MD, then record the decision.`,
        })
      )
    );
  } catch (e) {
    console.error("[sendRequestPendingApprovalNotification]", e);
  }
}

/** Decision recorded → the requester (and the MIS team), with the remark if any (§12.6). */
export async function sendRequestDecisionRecordedNotification(
  ticketId: string
): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const details = await getRequestDetailsRow(ticket.id);
    const approved = details?.mdDecision === "APPROVED";
    const verb = approved ? "approved" : "dropped";
    const remark = details?.mdRemark ? `\n“${details.mdRemark}”` : "";

    const reporter = await loadUser(ticket.createdBy);
    if (reporter) {
      await createInApp({
        userId: reporter.id,
        type: "REQUEST_DECISION_RECORDED",
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        title: `${ticket.number} was ${verb}`,
        body: `${ticket.title}${remark}`,
      });
    }
    await notifyTeam(
      ticket,
      "REQUEST_DECISION_RECORDED",
      `${ticket.number} was ${verb}`,
      `${ticket.title}${remark}`
    );
  } catch (e) {
    console.error("[sendRequestDecisionRecordedNotification]", e);
  }
}

/** Claimed for the build → the requester ("{member} is building it, deadline {date}"). */
export async function sendRequestClaimedNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    if (!reporter) return;
    const worker = await loadUser(ticket.assignedTo);
    const workerName = worker?.name ?? "An MIS member";
    const details = await getRequestDetailsRow(ticket.id);
    const eta = details?.deadline ? formatDeadline(details.deadline) : null;

    await createInApp({
      userId: reporter.id,
      type: "REQUEST_CLAIMED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `${workerName} has picked up ${ticket.number}`,
      // A claim carries no date — that arrives when they start work (mirrors §5),
      // so don't promise an ETA we don't have yet.
      body: eta
        ? `${ticket.title}\nTargeting delivery by ${eta}.`
        : `${ticket.title}\nThey'll confirm a delivery date when the build starts.`,
    });
  } catch (e) {
    console.error("[sendRequestClaimedNotification]", e);
  }
}

/**
 * Delivery date set or moved → the requester. Fired when the assignee starts work
 * (first date, `previous` = null) and on every later change — a delivery date is
 * never silent (P12).
 */
export async function sendRequestDeadlineChangedNotification(
  ticketId: string,
  previous: Date | null
): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    if (!reporter) return;
    const details = await getRequestDetailsRow(ticket.id);
    if (!details?.deadline) return;
    const now = formatDeadline(details.deadline);
    const was = previous ? formatDeadline(previous) : null;

    await createInApp({
      userId: reporter.id,
      type: "REQUEST_DEADLINE_CHANGED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `${ticket.number} has a new delivery date`,
      body: was
        ? `${ticket.title}\nDelivery moved from ${was} to ${now}.`
        : `${ticket.title}\nDelivery is now targeted for ${now}.`,
    });
  } catch (e) {
    console.error("[sendRequestDeadlineChangedNotification]", e);
  }
}

/** Progress logged → the requester (in-app). */
export async function sendRequestProgressNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    if (!reporter) return;

    await createInApp({
      userId: reporter.id,
      type: "REQUEST_PROGRESS",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `Progress on ${ticket.number}`,
      body: `${ticket.title}\nA new build update was posted.`,
    });
  } catch (e) {
    console.error("[sendRequestProgressNotification]", e);
  }
}

/** Build complete → the requester ("please test {number}"). */
export async function sendRequestReadyForTestingNotification(
  ticketId: string
): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    if (!reporter) return;

    await createInApp({
      userId: reporter.id,
      type: "REQUEST_READY_FOR_TESTING",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `${ticket.number} is ready to test`,
      body: `${ticket.title}\nPlease try it, then accept it or request changes.`,
    });
  } catch (e) {
    console.error("[sendRequestReadyForTestingNotification]", e);
  }
}

/** Requester asked for changes → the assignee. */
export async function sendRequestChangesNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const worker = await loadUser(ticket.assignedTo);
    if (!worker) return;
    const reporter = await loadUser(ticket.createdBy);

    await createInApp({
      userId: worker.id,
      type: "REQUEST_CHANGES_REQUESTED",
      ticketId: ticket.id,
      ticketNumber: ticket.number,
      title: `Changes requested on ${ticket.number}`,
      body: `${ticket.title}\n${reporter?.name ?? "The requester"} asked for changes — see the note in the thread.`,
    });
  } catch (e) {
    console.error("[sendRequestChangesNotification]", e);
  }
}

/** Requester accepted → the assignee (and the MIS team). */
export async function sendRequestAcceptedNotification(ticketId: string): Promise<void> {
  try {
    const ticket = await loadTicket(ticketId);
    if (!ticket) return;
    const reporter = await loadUser(ticket.createdBy);
    const who = reporter?.name ?? "The requester";
    const worker = await loadUser(ticket.assignedTo);
    if (worker) {
      await createInApp({
        userId: worker.id,
        type: "REQUEST_ACCEPTED",
        ticketId: ticket.id,
        ticketNumber: ticket.number,
        title: `${ticket.number} was accepted & closed`,
        body: `${ticket.title}\n${who} accepted the build. Nicely done.`,
      });
    }
    await notifyTeam(
      ticket,
      "REQUEST_ACCEPTED",
      `${ticket.number} was accepted & closed`,
      `${ticket.title}\n${who} accepted the build.`,
      // The assignee already got the tailored notice above — don't send it twice.
      { skipReporter: true, skipUserId: worker?.id ?? null }
    );
  } catch (e) {
    console.error("[sendRequestAcceptedNotification]", e);
  }
}
