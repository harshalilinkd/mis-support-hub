"use server";

import { revalidatePath } from "next/cache";
import type { ZodError } from "zod";

import { STAFF_ROLES } from "@/lib/authz";
import * as q from "@/lib/db/queries";
import type { RequestDetail } from "@/lib/db/queries";
import type { Status, TicketType } from "@/lib/db/schema";
import {
  sendRequestAcceptedNotification,
  sendRequestChangesNotification,
  sendRequestClaimedNotification,
  sendRequestDeadlineChangedNotification,
  sendRequestDecisionRecordedNotification,
  sendRequestPendingApprovalNotification,
  sendRequestProgressNotification,
  sendRequestReadyForTestingNotification,
  sendRequestReleasedNotification,
  sendRequestRevivedNotification,
  sendRequestSubmittedNotification,
} from "@/lib/notifications";
import { getCurrentUser, type SessionUser } from "@/lib/session";
import { canTransition } from "@/lib/ticket-state";
import {
  acceptRequestSchema,
  claimRequestSchema,
  createRequestSchema,
  markCompleteSchema,
  mdDecisionSchema,
  progressLogSchema,
  releaseRequestSchema,
  requestActionSchema,
  requestChangesSchema,
  startWorkSchema,
  updateDeadlineSchema,
} from "@/lib/validators/ticket";
import { fail, ok, type ActionResult } from "./result";

/**
 * REQUEST ("build me a new system") workflow actions (CLAUDE.md §12). Each move
 * is enforced against the REQUEST state machine + the §12.4 permission table
 * (amended: there is no MD role — an MIS_ADMIN records the approval offline).
 * Notifications are best-effort; every mutation writes its activity row (§12.5).
 */

function firstIssue(error: ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

// The request list lives at /requests; the detail reuses the shared /tickets/[number].
function revalidateRequestRoutes(number?: string) {
  revalidatePath("/requests");
  revalidatePath("/dashboard");
  if (number) revalidatePath(`/tickets/${number}`);
}

/** Load a ticket and confirm it's a REQUEST (guards against a wrong-type id). */
async function loadRequest(ticketId: string) {
  const ticket = await q.getTicketById(ticketId);
  if (!ticket || ticket.type !== "REQUEST") return null;
  return ticket;
}

/**
 * The single server-side gate (§12.3 topology + §12.4 permissions). Every
 * transition below runs through this, so lib/ticket-state.ts is the one source of
 * truth and the unit tests actually protect production. The friendlier role checks
 * in each action stay only to produce a better error message — this is the gate.
 */
function allows(
  ticket: { type: TicketType; status: Status; createdBy: string; assignedTo: string | null },
  to: Status,
  user: SessionUser
): boolean {
  return canTransition(
    ticket.type,
    ticket.status,
    to,
    user.role,
    ticket.createdBy === user.id,
    ticket.assignedTo === user.id
  );
}

/** Submit a new-system request — any authenticated user (§12.4). */
export async function createRequest(
  input: unknown
): Promise<ActionResult<{ id: string; number: string }>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");

  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));
  const d = parsed.data;

  const request = await q.createRequestTicket({
    createdBy: user.id,
    systemName: d.systemName,
    problemStatement: d.problemStatement,
    currentProcess: d.currentProcess ?? null,
    currentSheetLink: d.currentSheetLink ?? null,
    expectedBenefit: d.expectedBenefit,
    department: d.department,
  });

  await sendRequestSubmittedNotification(request.id);
  revalidateRequestRoutes(request.number);
  return ok({ id: request.id, number: request.number });
}

/** SUBMITTED → UNDER_REVIEW — MIS starts internal review (§12.3). */
export async function moveToReview(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can review requests.");
  }
  const parsed = requestActionSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (!allows(t, "UNDER_REVIEW", user)) {
    return fail(`Can't move ${t.number} into review from ${t.status}.`);
  }

  await q.setRequestStatusRow({
    ticketId: t.id,
    actorId: user.id,
    from: t.status,
    to: "UNDER_REVIEW",
    activity: "MOVED_TO_REVIEW",
  });
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/** UNDER_REVIEW → PENDING_MD_APPROVAL — MIS sends it up for the MD's decision. */
export async function sendForApproval(
  ticketId: string
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can send a request for approval.");
  }
  const parsed = requestActionSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (!allows(t, "PENDING_MD_APPROVAL", user)) {
    return fail(`Can't send ${t.number} for approval from ${t.status}.`);
  }

  await q.setRequestStatusRow({
    ticketId: t.id,
    actorId: user.id,
    from: t.status,
    to: "PENDING_MD_APPROVAL",
    activity: "SENT_FOR_APPROVAL",
  });
  await sendRequestPendingApprovalNotification(t.id);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/**
 * Record the MD's decision — MIS_ADMIN only (§12.4, amended: no MD role, the
 * admin ticks Approved/Rejected on the MD's behalf; who + when is captured).
 * APPROVED → APPROVED; REJECTED → DROPPED (remark optional even on reject).
 */
export async function recordApprovalDecision(input: {
  ticketId: string;
  decision: string;
  remark?: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (user.role !== "MIS_ADMIN") {
    return fail("Only an MIS admin can record the approval decision.");
  }
  const parsed = mdDecisionSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (t.status !== "PENDING_MD_APPROVAL") {
    return fail(`${t.number} isn't awaiting approval.`);
  }
  const to = parsed.data.decision === "APPROVED" ? "APPROVED" : "DROPPED";
  if (!allows(t, to, user)) {
    return fail(`Can't record that decision on ${t.number}.`);
  }

  await q.recordMdDecisionRow({
    ticketId: t.id,
    actorId: user.id,
    from: t.status,
    decision: parsed.data.decision,
    remark: parsed.data.remark ?? null,
  });
  await sendRequestDecisionRecordedNotification(t.id);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/** DROPPED → UNDER_REVIEW — MIS_ADMIN revives a dropped request (§12.3). */
export async function reviveRequest(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (user.role !== "MIS_ADMIN") {
    return fail("Only an MIS admin can revive a dropped request.");
  }
  const parsed = requestActionSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (t.status !== "DROPPED") {
    return fail(`Only a dropped request can be revived (${t.number} is ${t.status}).`);
  }
  if (!allows(t, "UNDER_REVIEW", user)) {
    return fail(`Can't revive ${t.number}.`);
  }

  await q.setRequestStatusRow({
    ticketId: t.id,
    actorId: user.id,
    from: t.status,
    to: "UNDER_REVIEW",
    activity: "REVIVED",
  });
  // §12.6's reversal rule: the DROPPED verdict was emailed to the requester and the
  // team, so its undo must reach the same people — otherwise that mail stands as the
  // last word on a request that is back under review.
  await sendRequestRevivedNotification(t.id);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/** APPROVED → CLAIMED — an MIS member takes the build (assignee + priority + deadline). */
export async function claimRequest(input: {
  ticketId: string;
  priority: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can claim a request.");
  }
  const parsed = claimRequestSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (t.status !== "APPROVED") {
    return fail(`${t.number} must be approved before it can be claimed.`);
  }
  if (t.assignedTo && t.assignedTo !== user.id) {
    const owner = await q.getUserById(t.assignedTo);
    return fail(
      `${t.number} is already claimed by ${owner?.name ?? owner?.email ?? "another staff member"}.`
    );
  }

  if (!allows(t, "CLAIMED", user)) {
    return fail(`Can't claim ${t.number} from ${t.status}.`);
  }

  await q.claimRequestRow({
    ticketId: t.id,
    actorId: user.id,
    from: t.status,
    priority: parsed.data.priority,
  });
  await sendRequestClaimedNotification(t.id);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/**
 * CLAIMED → APPROVED — undo a mis-claim, sending the build back to the approved
 * pool (mirrors `releaseTicket` for issues, §5). Clears the assignee, priority,
 * claim record and any deadline; the request is claimable again.
 *
 * Assignee-locked (§12.4): even an MIS_ADMIN may release only a build they claimed
 * themselves. Taking someone else's build is a takeover, not an undo.
 *
 * Allowed only while CLAIMED. Once started, a delivery date has been promised to
 * the requester, so it is no longer a quiet correction — that needs a real
 * conversation, not a button.
 */
export async function releaseRequest(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can release a request.");
  }
  const parsed = releaseRequestSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");

  if (!t.assignedTo) return fail(`${t.number} isn't claimed.`);
  if (t.assignedTo !== user.id) {
    const owner = await q.getUserById(t.assignedTo);
    return fail(
      `${t.number} is claimed by ${owner?.name ?? owner?.email ?? "another staff member"} — only they can release it.`
    );
  }
  if (t.status !== "CLAIMED") {
    return fail(
      `${t.number} has already been started — it can't be released back to the pool.`
    );
  }
  if (!allows(t, "APPROVED", user)) {
    return fail(`You can't release ${t.number}.`);
  }

  await q.releaseRequestRow({ ticketId: t.id, actorId: user.id });
  // The claim told the requester someone picked it up — correct that (§12.6).
  await sendRequestReleasedNotification(t.id);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/** Shared → IN_PROGRESS move, gated to the states the caller allows (§12.3). */
async function enterProgress(
  ticketId: string,
  allowedFrom: Status[]
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can work on a request.");
  }
  const parsed = requestActionSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (!allowedFrom.includes(t.status)) {
    return fail(`Can't move ${t.number} into progress from ${t.status}.`);
  }
  if (!allows(t, "IN_PROGRESS", user)) {
    return fail(`Only the assignee can work on ${t.number}.`);
  }

  await q.setRequestStatusRow({
    ticketId: t.id,
    actorId: user.id,
    from: t.status,
    to: "IN_PROGRESS",
    activity: "STARTED",
  });
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/**
 * CLAIMED → IN_PROGRESS — the assignee starts the build AND commits to a delivery
 * date. The date lives here, not on claim, so a request mirrors an issue (§5): the
 * promise is made when work actually starts. The requester is told the ETA.
 */
export async function startWork(input: {
  ticketId: string;
  deadline: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can work on a request.");
  }
  const parsed = startWorkSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (t.status !== "CLAIMED") {
    return fail(`Can't start the build on ${t.number} from ${t.status}.`);
  }
  if (!allows(t, "IN_PROGRESS", user)) {
    return fail(`Only the assignee can work on ${t.number}.`);
  }

  // Usually null — claiming sets no date. But "Change date" is offered while the
  // build is still CLAIMED, so a date may already have been promised; then this is
  // a MOVE and both the audit row and the requester must hear the old one (§12.6).
  const details = await q.getRequestDetailsRow(t.id);
  const previous = details?.deadline ?? null;

  await q.startWorkRow({
    ticketId: t.id,
    actorId: user.id,
    from: t.status,
    deadline: new Date(parsed.data.deadline),
    previousDeadline: previous,
  });
  // The requester always hears the date — a first set reads "targeted for X", a
  // move reads "moved from X to Y". Never silent either way.
  await sendRequestDeadlineChangedNotification(t.id, previous);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/**
 * CHANGES_REQUESTED → IN_PROGRESS — the assignee picks the build back up after the
 * requester asked for changes. The UAT loop is uncapped: this can happen as many
 * times as it takes (§12.3), and `revision_round` counts the attempts.
 */
export async function resumeWork(ticketId: string): Promise<ActionResult> {
  return enterProgress(ticketId, ["CHANGES_REQUESTED"]);
}

/**
 * Move the delivery deadline — the assignee (or an MIS_ADMIN). Audited via a
 * DEADLINE_SET row and the requester is notified: a deadline change is never
 * silent (P12). Only meaningful once the build is claimed and still in flight.
 */
export async function updateDeadline(input: {
  ticketId: string;
  deadline: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can change a delivery date.");
  }
  const parsed = updateDeadlineSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (t.assignedTo !== user.id && user.role !== "MIS_ADMIN") {
    return fail(`Only the assignee can change the delivery date on ${t.number}.`);
  }
  // A deadline only exists once claimed, and is meaningless after it's closed/dropped.
  const IN_FLIGHT: Status[] = [
    "CLAIMED",
    "IN_PROGRESS",
    "IN_TESTING",
    "CHANGES_REQUESTED",
  ];
  if (!IN_FLIGHT.includes(t.status)) {
    return fail(`${t.number} has no delivery date to change (it's ${t.status}).`);
  }

  const details = await q.getRequestDetailsRow(t.id);
  const next = new Date(parsed.data.deadline);
  const previous = details?.deadline ?? null;
  // No-op guard: don't log an audit row or ping the requester for the same date.
  if (previous && previous.getTime() === next.getTime()) return ok(undefined);

  await q.updateRequestDeadlineRow({
    ticketId: t.id,
    actorId: user.id,
    from: previous,
    to: next,
  });
  await sendRequestDeadlineChangedNotification(t.id, previous);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/** Log a build update / review session / blocker while IN_PROGRESS (§12.2). */
export async function addProgressLog(input: {
  ticketId: string;
  type: string;
  body: string;
  percentComplete?: number | string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can log progress.");
  }
  const parsed = progressLogSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (t.assignedTo !== user.id && user.role !== "MIS_ADMIN") {
    return fail(`Only the assignee can log progress on ${t.number}.`);
  }
  if (t.status !== "IN_PROGRESS") {
    return fail(`Log progress once the build is in progress (${t.number} is ${t.status}).`);
  }

  await q.addProgressLogRow({
    ticketId: t.id,
    authorId: user.id,
    type: parsed.data.type,
    body: parsed.data.body,
    percentComplete: parsed.data.percentComplete ?? null,
  });
  await sendRequestProgressNotification(t.id);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/** IN_PROGRESS → IN_TESTING — MIS marks the build complete, hands to the requester. */
export async function markComplete(input: {
  ticketId: string;
  note?: string;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  if (!STAFF_ROLES.includes(user.role)) {
    return fail("Only MIS staff can mark a build complete.");
  }
  const parsed = markCompleteSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (t.assignedTo !== user.id && user.role !== "MIS_ADMIN") {
    return fail(`Only the assignee can mark ${t.number} complete.`);
  }
  if (!allows(t, "IN_TESTING", user)) {
    return fail(`Can't mark ${t.number} complete from ${t.status}.`);
  }

  await q.markRequestCompleteRow({
    ticketId: t.id,
    actorId: user.id,
    from: t.status,
    note: parsed.data.note ?? null,
  });
  await sendRequestReadyForTestingNotification(t.id);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/** IN_TESTING → CHANGES_REQUESTED — the requester asks for changes (revision++, §12.5). */
export async function requestChanges(input: {
  ticketId: string;
  body: string;
}): Promise<ActionResult<{ commentId: string; round: number }>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  const parsed = requestChangesSchema.safeParse(input);
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  const isReporter = t.createdBy === user.id;
  const isAdmin = user.role === "MIS_ADMIN";
  if (!isReporter && !isAdmin) {
    return fail("Only the requester can ask for changes.");
  }
  if (t.status !== "IN_TESTING") {
    return fail(`${t.number} isn't in testing.`);
  }

  if (!allows(t, "CHANGES_REQUESTED", user)) {
    return fail(`Only the requester can ask for changes on ${t.number}.`);
  }

  const details = await q.getRequestDetailsRow(t.id);
  const res = await q.requestChangesRow({
    ticketId: t.id,
    actorId: user.id,
    from: t.status,
    body: parsed.data.body,
    currentRound: details?.revisionRound ?? 0,
  });
  await sendRequestChangesNotification(t.id);
  revalidateRequestRoutes(t.number);
  // The comment id lets the caller attach the requester's files to this exact
  // change request (the shared P4 attachTo flow).
  return ok(res);
}

/** IN_TESTING → CLOSED — the requester accepts. Only acceptance closes it (§12.4). */
export async function acceptRequest(ticketId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  const parsed = acceptRequestSchema.safeParse({ ticketId });
  if (!parsed.success) return fail(firstIssue(parsed.error));

  const t = await loadRequest(parsed.data.ticketId);
  if (!t) return fail("Request not found.");
  if (t.createdBy !== user.id) {
    return fail("Only the requester can accept and close this request.");
  }
  if (t.status !== "IN_TESTING") {
    return fail(`${t.number} isn't ready to accept.`);
  }

  if (!allows(t, "CLOSED", user)) {
    return fail(`Only the requester can accept and close ${t.number}.`);
  }

  await q.acceptRequestRow({ ticketId: t.id, actorId: user.id, from: t.status });
  await sendRequestAcceptedNotification(t.id);
  revalidateRequestRoutes(t.number);
  return ok(undefined);
}

/** Read the full REQUEST detail for the viewer (§6 visibility enforced in the query). */
export async function loadRequestDetail(
  number: string
): Promise<ActionResult<RequestDetail>> {
  const user = await getCurrentUser();
  if (!user) return fail("You must be signed in.");
  const request = await q.getRequestByNumber(number, {
    id: user.id,
    role: user.role,
  });
  if (!request) return fail("Request not found.");
  return ok(request);
}
