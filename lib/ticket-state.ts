import type { Role, Status, TicketType } from "@/lib/db/schema";

/**
 * Ticket lifecycle state machines (CLAUDE.md §5 for ISSUE, §12.3 for REQUEST).
 *
 * ONE `status` enum holds both state sets; the machine that applies is chosen by
 * `ticket.type`. `IN_PROGRESS` and `CLOSED` are shared values that mean different
 * things per type (an ISSUE IN_PROGRESS → RESOLVED; a REQUEST IN_PROGRESS →
 * IN_TESTING), which is exactly why the transition map must be type-aware.
 *
 * This module is pure (type-only import) and safe to import from client UI.
 */

/**
 * ISSUE machine. OPEN → IN_PROGRESS → RESOLVED → CLOSED; RESOLVED may reopen →
 * REOPENED (handled separately by `reopenTicket`, different permissions, so not
 * listed here). OPEN → IN_PROGRESS ("start work") is listed so the UI can offer
 * it, but it is performed by `startTask` (needs assignee + deadline), never by
 * `updateStatus`. REQUEST-only statuses can never occur on an ISSUE → no exits.
 */
export const STATUS_TRANSITIONS: Record<Status, Status[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  REOPENED: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
  SUBMITTED: [],
  UNDER_REVIEW: [],
  PENDING_MD_APPROVAL: [],
  APPROVED: [],
  DROPPED: [],
  CLAIMED: [],
  IN_TESTING: [],
  CHANGES_REQUESTED: [],
};

/**
 * REQUEST machine (§12.3, authoritative). Approvals, the MD gate, the build, and
 * the requester-driven UAT loop. CHANGES_REQUESTED ⇄ IN_PROGRESS loops with no
 * cap (revision_round tracks the count). Only the requester's acceptance
 * (IN_TESTING → CLOSED) closes a request — MIS may never force-close it.
 * DROPPED → UNDER_REVIEW is the MIS_ADMIN revive. ISSUE-only statuses never
 * occur on a REQUEST → no exits.
 */
export const REQUEST_STATUS_TRANSITIONS: Record<Status, Status[]> = {
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["PENDING_MD_APPROVAL"],
  PENDING_MD_APPROVAL: ["APPROVED", "DROPPED"],
  APPROVED: ["CLAIMED"],
  // → APPROVED is the release/undo hatch, mirroring the ISSUE release (§5): the
  // assignee sends a build back to the approved pool. Reachable from CLAIMED (claimed
  // by mistake) AND from IN_PROGRESS / CHANGES_REQUESTED (started by mistake, or
  // handing back work already begun).
  //
  // §12.3 originally allowed it ONLY from CLAIMED, reasoning that once started "a
  // delivery date has been promised, so it is no longer a quiet undo" — the same
  // premise §5 used, and the same wrong conclusion. §12.6's reversal rule says an
  // announced change needs its reversal ANNOUNCED, not forbidden. Forbidding it left a
  // mis-started build with no way back: not releasable, not reassignable (§12.3 has no
  // takeover), only markable complete.
  CLAIMED: ["IN_PROGRESS", "APPROVED"],
  IN_PROGRESS: ["IN_TESTING", "APPROVED"],
  IN_TESTING: ["CHANGES_REQUESTED", "CLOSED"],
  CHANGES_REQUESTED: ["IN_PROGRESS", "APPROVED"],
  DROPPED: ["UNDER_REVIEW"],
  CLOSED: [],
  OPEN: [],
  RESOLVED: [],
  REOPENED: [],
};

/** Allowed target statuses from `from`, for the given ticket type. */
export function transitionsFor(type: TicketType, from: Status): Status[] {
  const map = type === "REQUEST" ? REQUEST_STATUS_TRANSITIONS : STATUS_TRANSITIONS;
  return map[from] ?? [];
}

/* ------------------------------------------------------------------ *
 * Actor-aware transition permissions (CLAUDE.md §12.4 for REQUEST, §5/§6 for
 * ISSUE). Applied ONLY after the topology check passes.
 * ------------------------------------------------------------------ */
function requestActorAllows(
  from: Status,
  to: Status,
  role: Role,
  isRequester: boolean,
  isAssignee: boolean
): boolean {
  const isAdmin = role === "MIS_ADMIN";
  const isStaff = role === "MIS_STAFF" || isAdmin;
  // Working the build (start / mark complete / resume) is the assignee or an admin.
  const canBuild = isAdmin || (isStaff && isAssignee);
  switch (`${from}->${to}`) {
    case "SUBMITTED->UNDER_REVIEW":
      return isStaff;
    case "UNDER_REVIEW->PENDING_MD_APPROVAL":
      return isStaff;
    // Approval verdict recorded by an MIS_ADMIN on the MD's behalf — admin only.
    case "PENDING_MD_APPROVAL->APPROVED":
    case "PENDING_MD_APPROVAL->DROPPED":
      return isAdmin;
    case "APPROVED->CLAIMED":
      return isStaff;
    // Releasing is ASSIGNEE-LOCKED, deliberately stricter than canBuild: even an
    // MIS_ADMIN may only undo a claim/start they made themselves, never someone
    // else's (mirrors the ISSUE release lock, §6). Taking a build off another member
    // is a takeover, not an undo.
    case "CLAIMED->APPROVED":
    case "IN_PROGRESS->APPROVED":
    case "CHANGES_REQUESTED->APPROVED":
      return isStaff && isAssignee;
    case "CLAIMED->IN_PROGRESS":
    case "IN_PROGRESS->IN_TESTING":
    case "CHANGES_REQUESTED->IN_PROGRESS":
      return canBuild;
    // Only the requester's acceptance closes a request — MIS never force-closes.
    case "IN_TESTING->CLOSED":
      return isRequester;
    case "IN_TESTING->CHANGES_REQUESTED":
      return isRequester || isAdmin;
    // Revive a dropped request — MIS_ADMIN only.
    case "DROPPED->UNDER_REVIEW":
      return isAdmin;
    default:
      return false;
  }
}

function issueActorAllows(
  from: Status,
  to: Status,
  role: Role,
  isRequester: boolean
): boolean {
  const isAdmin = role === "MIS_ADMIN";
  const isStaff = role === "MIS_STAFF" || isAdmin;
  switch (`${from}->${to}`) {
    // Only MIS moves an issue into progress / resolves it (§6).
    case "OPEN->IN_PROGRESS":
    case "OPEN->RESOLVED":
    case "IN_PROGRESS->RESOLVED":
    case "REOPENED->RESOLVED":
      return isStaff;
    // The reporter confirms a resolved issue → closed (admin may too) (§5).
    case "RESOLVED->CLOSED":
      return isRequester || isAdmin;
    default:
      return false;
  }
}

/**
 * Legacy topological check: is `from → to` a legal transition for the type
 * (default ISSUE)? Role-agnostic — used by the issue board/actions.
 */
export function canTransition(from: Status, to: Status, type?: TicketType): boolean;
/**
 * Full guardrail (§12.5): a transition is allowed only if it is BOTH a legal edge
 * of the type's machine AND permitted for this actor (§12.4 for REQUEST, §5/§6 for
 * ISSUE). `isRequester` = actor created the ticket; `isAssignee` = actor is its
 * current assignee.
 */
export function canTransition(
  type: TicketType,
  from: Status,
  to: Status,
  actorRole: Role,
  isRequester: boolean,
  isAssignee: boolean
): boolean;
export function canTransition(
  a: Status | TicketType,
  b: Status,
  c?: Status | TicketType,
  actorRole?: Role,
  isRequester?: boolean,
  isAssignee?: boolean
): boolean {
  // Legacy form: (from, to, type?) — no actorRole → topology only.
  if (actorRole === undefined) {
    const from = a as Status;
    const to = b;
    const type = (c as TicketType) ?? "ISSUE";
    return transitionsFor(type, from).includes(to);
  }
  // Full form: (type, from, to, actorRole, isRequester, isAssignee).
  const type = a as TicketType;
  const from = b;
  const to = c as Status;
  if (!transitionsFor(type, from).includes(to)) return false;
  return type === "REQUEST"
    ? requestActorAllows(from, to, actorRole, !!isRequester, !!isAssignee)
    : issueActorAllows(from, to, actorRole, !!isRequester);
}

/** The statuses each type can legally hold — used to reject a wrong-type status. */
export const ISSUE_STATUSES: Status[] = [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
];
export const REQUEST_STATUSES: Status[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "PENDING_MD_APPROVAL",
  "APPROVED",
  "DROPPED",
  "CLAIMED",
  "IN_PROGRESS",
  "IN_TESTING",
  "CHANGES_REQUESTED",
  "CLOSED",
];

/** Is `status` valid for a ticket of this type? (Server-side guard, §12.) */
export function statusBelongsToType(type: TicketType, status: Status): boolean {
  return (type === "REQUEST" ? REQUEST_STATUSES : ISSUE_STATUSES).includes(status);
}

/**
 * Reject a status that belongs to the other type's state set (§12). Throws so a
 * caller (server action / query) fails loudly rather than persisting a status the
 * type's machine can never reach.
 */
export function assertStatusForType(type: TicketType, status: Status): void {
  if (!statusBelongsToType(type, status)) {
    throw new Error(
      `Invalid status "${status}" for a ${type} ticket — it belongs to the other type's state set.`
    );
  }
}

/** Statuses treated as "active work" per type (board columns / dashboards / badges). */
export const ACTIVE_STATUSES: Status[] = ["OPEN", "IN_PROGRESS", "REOPENED"];
/** A REQUEST is "in flight" everywhere except once dropped or closed. */
export const REQUEST_ACTIVE_STATUSES: Status[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "PENDING_MD_APPROVAL",
  "APPROVED",
  "CLAIMED",
  "IN_PROGRESS",
  "IN_TESTING",
  "CHANGES_REQUESTED",
];

/** Days a RESOLVED ticket waits before auto-CLOSE (CLAUDE.md §5; cron in a later phase). */
export const AUTO_CLOSE_DAYS = 7;

/**
 * May this actor release an ISSUE back to the open pool? (§5.)
 *
 * ASSIGNEE-LOCKED — even an MIS_ADMIN releases only their own claim; taking a ticket
 * off a colleague is a takeover, not an undo (§6).
 *
 * Allowed from OPEN (claimed, not started) AND from IN_PROGRESS/REOPENED (started by
 * mistake). §5 originally forbade the latter, reasoning that the reporter had already
 * been told work started, so it was "no longer a quiet undo". That premise is right and
 * the conclusion was wrong: §12.6's reversal rule says an announced change needs its
 * reversal ANNOUNCED, not forbidden. Forbidding it left a mis-started ticket with no
 * exit but "Mark resolved" — resolving work nobody did, and asking the reporter to
 * confirm a fix that doesn't exist. Releasing after a start therefore notifies the
 * reporter (§8); releasing from OPEN stays silent, because the claim was silent too.
 *
 * Never from RESOLVED/CLOSED: the work is done and the reporter is mid-verification.
 */
export function canReleaseTicket(
  isAssignee: boolean,
  status: Status
): boolean {
  if (!isAssignee) return false;
  return status === "OPEN" || status === "IN_PROGRESS" || status === "REOPENED";
}

/**
 * Which REQUEST statuses can be released back to the approved pool (§12.3)?
 * The topology + actor rule already encode this — this is the readable form the
 * action and the button share, so neither re-derives the list.
 */
export const REQUEST_RELEASABLE_FROM: Status[] = [
  "CLAIMED",
  "IN_PROGRESS",
  "CHANGES_REQUESTED",
];

/** Did releasing from this status falsify a notification the reporter already got? */
export function releaseNeedsNotice(status: Status): boolean {
  // A claim is quiet (§8) — releasing an unstarted ticket corrects nothing.
  // Starting emails the reporter ("work started, expected by X"), so undoing it must say so.
  return status === "IN_PROGRESS" || status === "REOPENED";
}

/**
 * May this actor log progress on a REQUEST? (§12.4 — "Add progress log: assignee".)
 *
 * ASSIGNEE-ONLY, with **no admin override** — deliberately narrower than the build
 * actions beside it (`canBuild = isAdmin || (isStaff && isAssignee)`), which do let an
 * admin act on anyone's build. A progress log is not an administrative act on the
 * build; it is a first-person statement about it ("I got X done, it's 80% there").
 * Someone who isn't building it cannot truthfully make that statement, and a log
 * attributed to a non-builder makes the timeline lie about who knows what.
 *
 * This lives here, next to the transition gates, so the server action and the UI share
 * ONE tested predicate rather than each carrying its own copy of the rule — the bug
 * this replaces was exactly that drift (the composer and the action both allowed any
 * admin, so a non-assignee could post "80%" on someone else's build).
 *
 * Progress logging is not a status transition, so it can't ride on canTransition.
 */
export function canLogProgress(
  role: Role,
  isAssignee: boolean,
  status: Status
): boolean {
  const isStaffRole = role === "MIS_STAFF" || role === "MIS_ADMIN";
  // There is nothing to report on before the build starts, and nothing to add once
  // it's handed over for testing (§12.3).
  if (status !== "IN_PROGRESS") return false;
  return isStaffRole && isAssignee;
}
