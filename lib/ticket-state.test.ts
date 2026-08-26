import test from "node:test";
import assert from "node:assert/strict";

import type { Role, Status } from "@/lib/db/schema";
import {
  assertStatusForType,
  AUTO_CLOSE_DAYS,
  autoCloseDue,
  availableRequestMoves,
  canLogProgress,
  canMoveTicketType,
  canReleaseTicket,
  canTransition,
  isAutoCloseEligible,
  moveTargetType,
  releaseNeedsNotice,
  canResolveIssue,
  completionDateFor,
  startDateFor,
  type RequestMoveId,
} from "./ticket-state";

/**
 * Guardrail tests for the REQUEST state machine + §12.4 permissions (and a few
 * ISSUE checks). Pure — no DB. Run with `npm test`.
 */

const STAFF: Role = "MIS_STAFF";
const ADMIN: Role = "MIS_ADMIN";
const USER: Role = "USER";

type Edge = [Status, Status, Role, boolean, boolean]; // from, to, role, isRequester, isAssignee

// Every legal REQUEST edge, with an actor permitted to make it (§12.3/§12.4).
const LEGAL_REQUEST: Edge[] = [
  ["SUBMITTED", "UNDER_REVIEW", STAFF, false, false],
  ["SUBMITTED", "UNDER_REVIEW", ADMIN, false, false],
  ["UNDER_REVIEW", "PENDING_MD_APPROVAL", STAFF, false, false],
  ["PENDING_MD_APPROVAL", "APPROVED", ADMIN, false, false],
  ["PENDING_MD_APPROVAL", "DROPPED", ADMIN, false, false],
  ["APPROVED", "CLAIMED", STAFF, false, false],
  ["CLAIMED", "APPROVED", STAFF, false, true], // release: own claim only
  ["CLAIMED", "APPROVED", ADMIN, false, true], // admin releasing their OWN claim
  ["IN_PROGRESS", "APPROVED", STAFF, false, true], // release AFTER starting
  ["IN_PROGRESS", "APPROVED", ADMIN, false, true],
  ["CHANGES_REQUESTED", "APPROVED", STAFF, false, true], // hand back mid-revision
  ["CLAIMED", "IN_PROGRESS", STAFF, false, true], // assignee
  ["CLAIMED", "IN_PROGRESS", ADMIN, false, false], // admin may build
  ["IN_PROGRESS", "IN_TESTING", STAFF, false, true],
  ["IN_PROGRESS", "IN_TESTING", ADMIN, false, false],
  ["IN_TESTING", "CLOSED", USER, true, false], // requester accepts
  ["IN_TESTING", "CHANGES_REQUESTED", USER, true, false], // requester
  ["IN_TESTING", "CHANGES_REQUESTED", ADMIN, false, false], // admin may too
  ["CHANGES_REQUESTED", "IN_PROGRESS", STAFF, false, true],
  ["DROPPED", "UNDER_REVIEW", ADMIN, false, false], // revive
];

// Topologically illegal — false for ANY actor (tested with a maximally-permissive one).
const ILLEGAL_TOPOLOGY: [Status, Status][] = [
  ["SUBMITTED", "CLOSED"],
  ["SUBMITTED", "IN_PROGRESS"],
  ["UNDER_REVIEW", "APPROVED"],
  ["APPROVED", "IN_PROGRESS"], // must pass through CLAIMED
  // NOTE: IN_PROGRESS→APPROVED and CHANGES_REQUESTED→APPROVED used to be listed here
  // as illegal ("a started build can't be quietly released"). They are now the release
  // hatch (§12.3) — a started build CAN be handed back, and the requester is told.
  ["IN_TESTING", "APPROVED"], // the requester is verifying — no yanking it back
  ["CLOSED", "APPROVED"],
  ["DROPPED", "IN_PROGRESS"], // DROPPED only revives to UNDER_REVIEW
  ["CLOSED", "IN_PROGRESS"],
  ["PENDING_MD_APPROVAL", "CLAIMED"],
];

// Topologically legal but the actor is NOT permitted (§12.4) — must be false.
const FORBIDDEN_ACTOR: Edge[] = [
  // Approve / reject: MIS_ADMIN only — never USER or MIS_STAFF.
  ["PENDING_MD_APPROVAL", "APPROVED", USER, false, false],
  ["PENDING_MD_APPROVAL", "APPROVED", STAFF, false, false],
  ["PENDING_MD_APPROVAL", "DROPPED", USER, false, false],
  ["PENDING_MD_APPROVAL", "DROPPED", STAFF, false, false],
  // Revive: MIS_ADMIN only.
  ["DROPPED", "UNDER_REVIEW", USER, false, false],
  ["DROPPED", "UNDER_REVIEW", STAFF, false, true],
  // Close: requester ONLY — MIS may never force-close.
  ["IN_TESTING", "CLOSED", ADMIN, false, false],
  ["IN_TESTING", "CLOSED", STAFF, false, true],
  ["IN_TESTING", "CLOSED", USER, false, false], // a USER who isn't the requester
  // Request changes: not MIS_STAFF.
  ["IN_TESTING", "CHANGES_REQUESTED", STAFF, false, true],
  // Move to review / claim: staff-gated, not USER.
  ["SUBMITTED", "UNDER_REVIEW", USER, false, false],
  ["APPROVED", "CLAIMED", USER, false, false],
  // Release: you undo only your OWN claim. Stricter than the build steps — an
  // admin may build anyone's claim but may not release it out from under them.
  ["CLAIMED", "APPROVED", ADMIN, false, false],
  ["CLAIMED", "APPROVED", STAFF, false, false],
  ["CLAIMED", "APPROVED", USER, false, true],
  // The lock holds in the started states too — release is an undo, never a takeover.
  ["IN_PROGRESS", "APPROVED", ADMIN, false, false],
  ["IN_PROGRESS", "APPROVED", STAFF, false, false],
  ["CHANGES_REQUESTED", "APPROVED", ADMIN, false, false],
  // Build steps: the assigned staff (or admin) only — not a non-assignee staffer.
  ["CLAIMED", "IN_PROGRESS", STAFF, false, false],
  ["IN_PROGRESS", "IN_TESTING", STAFF, false, false],
  ["CHANGES_REQUESTED", "IN_PROGRESS", STAFF, false, false],
  // A USER never builds, even if somehow flagged as the assignee.
  ["CLAIMED", "IN_PROGRESS", USER, false, true],
  // A USER never sends a request up for approval.
  ["UNDER_REVIEW", "PENDING_MD_APPROVAL", USER, false, false],
];

test("every legal REQUEST edge is allowed for a permitted actor", () => {
  for (const [from, to, role, req, asg] of LEGAL_REQUEST) {
    assert.equal(
      canTransition("REQUEST", from, to, role, req, asg),
      true,
      `expected ${from} → ${to} allowed for ${role} (req=${req}, asg=${asg})`
    );
  }
});

test("topologically illegal REQUEST edges are rejected for any actor", () => {
  for (const [from, to] of ILLEGAL_TOPOLOGY) {
    assert.equal(
      canTransition("REQUEST", from, to, ADMIN, true, true),
      false,
      `expected ${from} → ${to} rejected even for an all-powerful actor`
    );
  }
});

test("legal REQUEST edges are rejected for a forbidden actor (§12.4)", () => {
  for (const [from, to, role, req, asg] of FORBIDDEN_ACTOR) {
    assert.equal(
      canTransition("REQUEST", from, to, role, req, asg),
      false,
      `expected ${from} → ${to} rejected for ${role} (req=${req}, asg=${asg})`
    );
  }
});

test("assertStatusForType rejects a wrong-type status", () => {
  // Cross-type statuses throw.
  assert.throws(() => assertStatusForType("ISSUE", "SUBMITTED"));
  assert.throws(() => assertStatusForType("ISSUE", "PENDING_MD_APPROVAL"));
  assert.throws(() => assertStatusForType("REQUEST", "OPEN"));
  assert.throws(() => assertStatusForType("REQUEST", "REOPENED"));
  // Same-type (incl. the shared IN_PROGRESS / CLOSED) do not throw.
  assert.doesNotThrow(() => assertStatusForType("ISSUE", "OPEN"));
  assert.doesNotThrow(() => assertStatusForType("ISSUE", "CLOSED"));
  assert.doesNotThrow(() => assertStatusForType("REQUEST", "SUBMITTED"));
  assert.doesNotThrow(() => assertStatusForType("REQUEST", "IN_PROGRESS"));
  assert.doesNotThrow(() => assertStatusForType("REQUEST", "CLOSED"));
});

test("ISSUE machine still enforces §5/§6", () => {
  assert.equal(canTransition("ISSUE", "OPEN", "IN_PROGRESS", STAFF, false, false), true);
  // Resolving is ADMIN-only now (§6, canResolveIssue) — staff claim/start/release only.
  assert.equal(canTransition("ISSUE", "IN_PROGRESS", "RESOLVED", ADMIN, false, false), true);
  assert.equal(canTransition("ISSUE", "IN_PROGRESS", "RESOLVED", STAFF, false, false), false);
  assert.equal(canTransition("ISSUE", "RESOLVED", "CLOSED", USER, true, false), true); // reporter confirms
  assert.equal(canTransition("ISSUE", "RESOLVED", "CLOSED", ADMIN, false, false), true); // admin may
  assert.equal(canTransition("ISSUE", "RESOLVED", "CLOSED", STAFF, false, false), false); // non-reporter staff can't
  assert.equal(canTransition("ISSUE", "OPEN", "IN_PROGRESS", USER, true, false), false); // reporter can't start
  assert.equal(canTransition("ISSUE", "OPEN", "SUBMITTED", ADMIN, true, true), false); // cross-machine edge
});

test("a REQUEST can never reach the ISSUE terminal states (force-close regression)", () => {
  // Regression: the ISSUE actions used to evaluate a REQUEST against the ISSUE
  // machine, where IN_PROGRESS → RESOLVED → CLOSED is legal — letting MIS
  // force-close a request, which §12.4 forbids. On the REQUEST machine, and via
  // the type guard, those edges must not exist.
  assert.equal(canTransition("REQUEST", "IN_PROGRESS", "RESOLVED", ADMIN, true, true), false);
  assert.equal(canTransition("REQUEST", "IN_PROGRESS", "CLOSED", ADMIN, true, true), false);
  assert.equal(canTransition("REQUEST", "RESOLVED", "CLOSED", ADMIN, true, true), false);
  assert.throws(() => assertStatusForType("REQUEST", "RESOLVED"));
});

test("a REQUEST can be released after it was started, and only by its assignee (§12.3)", () => {
  // The mis-claim AND mis-start escape hatch, mirroring the ISSUE release (§5).
  // You may undo your OWN claim, before or after starting...
  assert.equal(canTransition("REQUEST", "CLAIMED", "APPROVED", STAFF, false, true), true);
  assert.equal(canTransition("REQUEST", "CLAIMED", "APPROVED", ADMIN, false, true), true);
  assert.equal(canTransition("REQUEST", "IN_PROGRESS", "APPROVED", STAFF, false, true), true);
  assert.equal(canTransition("REQUEST", "CHANGES_REQUESTED", "APPROVED", STAFF, false, true), true);

  // ...but never someone else's. Deliberately stricter than the build steps: an admin
  // may start/complete anyone's build, yet must not yank a claim out from under the
  // member who made it — that's a takeover, not an undo.
  assert.equal(canTransition("REQUEST", "CLAIMED", "APPROVED", ADMIN, false, false), false);
  assert.equal(canTransition("REQUEST", "IN_PROGRESS", "APPROVED", ADMIN, false, false), false);
  assert.equal(canTransition("REQUEST", "CHANGES_REQUESTED", "APPROVED", STAFF, false, false), false);
  // A USER never releases, even if somehow flagged as the assignee.
  assert.equal(canTransition("REQUEST", "IN_PROGRESS", "APPROVED", USER, false, true), false);

  // Once handed over for testing it is the requester's call — MIS can't pull it back.
  assert.equal(canTransition("REQUEST", "IN_TESTING", "APPROVED", ADMIN, true, true), false);
  assert.equal(canTransition("REQUEST", "CLOSED", "APPROVED", ADMIN, true, true), false);

  // And releasing must never be a back door to the approval verdict itself.
  assert.equal(canTransition("REQUEST", "CLAIMED", "PENDING_MD_APPROVAL", ADMIN, false, true), false);
});

test("an ISSUE can be released after it was started, and only by its assignee (§5)", () => {
  // Regression: §5 allowed release ONLY from OPEN, reasoning that once started the
  // reporter had been notified so it was "no longer a quiet undo". That left a
  // mis-started ticket with no exit but Mark resolved — resolving work nobody did.
  // §12.6's reversal rule says announce the undo, don't forbid it.
  assert.equal(canReleaseTicket(true, "OPEN"), true); // claimed, not started
  assert.equal(canReleaseTicket(true, "IN_PROGRESS"), true); // started by mistake
  assert.equal(canReleaseTicket(true, "REOPENED"), true);

  // Assignee-locked (§6) — a release is an undo of YOUR claim, never a takeover.
  assert.equal(canReleaseTicket(false, "OPEN"), false);
  assert.equal(canReleaseTicket(false, "IN_PROGRESS"), false);

  // Never once the work is done and the reporter is mid-verification.
  assert.equal(canReleaseTicket(true, "RESOLVED"), false);
  assert.equal(canReleaseTicket(true, "CLOSED"), false);
});

test("releasing announces itself only when the start was announced (§8/§12.6)", () => {
  // The reversal rule gives DIFFERENT answers for the two undos, from one premise:
  // an ISSUE claim is silent (§8), so releasing an unstarted ticket corrects nothing...
  assert.equal(releaseNeedsNotice("OPEN"), false);
  // ...but starting emails the reporter "expected by X", so abandoning it must say so.
  assert.equal(releaseNeedsNotice("IN_PROGRESS"), true);
  assert.equal(releaseNeedsNotice("REOPENED"), true);
});

test("only the member building it can log progress — no admin override (§12.4)", () => {
  // Regression: the composer AND addProgressLog both read
  // `isAdmin || (isStaff && isAssignee)`, so any admin could post a first-person
  // "80% done" on a build someone else was doing. Observed in production: a
  // non-assignee logged 80% on a request another member had claimed.
  assert.equal(canLogProgress(STAFF, true, "IN_PROGRESS"), true);
  assert.equal(canLogProgress(ADMIN, true, "IN_PROGRESS"), true); // admin who claimed it

  // The fix: not the assignee ⇒ no. Deliberately STRICTER than the build actions
  // beside it, where an admin may act on anyone's build — you cannot truthfully
  // report first-person progress on work you aren't doing.
  assert.equal(canLogProgress(ADMIN, false, "IN_PROGRESS"), false);
  assert.equal(canLogProgress(STAFF, false, "IN_PROGRESS"), false);
  // A USER never logs progress, even if somehow flagged as the assignee.
  assert.equal(canLogProgress(USER, true, "IN_PROGRESS"), false);

  // Only while the build is actually running: nothing to report before it starts,
  // nothing to add once it's handed over (§12.3).
  for (const s of ["CLAIMED", "IN_TESTING", "CHANGES_REQUESTED", "CLOSED", "APPROVED"] as Status[]) {
    assert.equal(canLogProgress(STAFF, true, s), false, `assignee must not log while ${s}`);
    assert.equal(canLogProgress(ADMIN, true, s), false, `admin assignee must not log while ${s}`);
  }
});

test("P11 lifecycle: submit → review → approval → approve/reject → revive", () => {
  // The exact P11 path, driven through the real gate with the real actors.
  // Approve path.
  assert.equal(canTransition("REQUEST", "SUBMITTED", "UNDER_REVIEW", STAFF, false, false), true);
  assert.equal(canTransition("REQUEST", "UNDER_REVIEW", "PENDING_MD_APPROVAL", STAFF, false, false), true);
  assert.equal(canTransition("REQUEST", "PENDING_MD_APPROVAL", "APPROVED", ADMIN, false, false), true);
  // Reject path → DROPPED, then an admin-only revive back into review.
  assert.equal(canTransition("REQUEST", "PENDING_MD_APPROVAL", "DROPPED", ADMIN, false, false), true);
  assert.equal(canTransition("REQUEST", "DROPPED", "UNDER_REVIEW", ADMIN, false, false), true);

  // The same path is closed to everyone else at each gated step.
  assert.equal(canTransition("REQUEST", "SUBMITTED", "UNDER_REVIEW", USER, true, false), false);
  assert.equal(canTransition("REQUEST", "PENDING_MD_APPROVAL", "APPROVED", STAFF, false, false), false);
  assert.equal(canTransition("REQUEST", "PENDING_MD_APPROVAL", "DROPPED", STAFF, false, false), false);
  assert.equal(canTransition("REQUEST", "DROPPED", "UNDER_REVIEW", STAFF, false, false), false);
  // A dropped request cannot skip straight back into the build.
  assert.equal(canTransition("REQUEST", "DROPPED", "IN_PROGRESS", ADMIN, true, true), false);
});

test("legacy 2/3-arg canTransition remains a pure topology check", () => {
  assert.equal(canTransition("OPEN", "IN_PROGRESS"), true); // ISSUE default
  assert.equal(canTransition("OPEN", "CLOSED"), false);
  assert.equal(canTransition("SUBMITTED", "UNDER_REVIEW", "REQUEST"), true);
  assert.equal(canTransition("SUBMITTED", "CLOSED", "REQUEST"), false);
});

/* ------------------------------------------------------------------ *
 * availableRequestMoves — the inline row control shares this with the detail bar,
 * so its promise is: every move it offers is a transition the server permits.
 * ------------------------------------------------------------------ */

// The status transition each move performs (release is from→APPROVED, computed below).
const MOVE_TARGET: Record<RequestMoveId, Status> = {
  review: "UNDER_REVIEW",
  sendApproval: "PENDING_MD_APPROVAL",
  recordDecision: "APPROVED", // (or DROPPED — both are admin-only, same gate)
  revive: "UNDER_REVIEW",
  claim: "CLAIMED",
  startBuild: "IN_PROGRESS",
  release: "APPROVED",
  resume: "IN_PROGRESS",
  markComplete: "IN_TESTING",
  accept: "CLOSED",
  requestChanges: "CHANGES_REQUESTED",
};

const REQUEST_STATES: Status[] = [
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

const ALL_ROLES: Role[] = [USER, STAFF, ADMIN];

test("availableRequestMoves never offers a move the server would reject", () => {
  // Exhaustive matrix: every status × role × requester/assignee/assigned combo.
  for (const status of REQUEST_STATES) {
    for (const role of ALL_ROLES) {
      for (const isRequester of [false, true]) {
        for (const isAssignee of [false, true]) {
          for (const assigned of [false, true]) {
            const moves = availableRequestMoves(status, {
              role,
              isRequester,
              isAssignee,
              assigned,
            });
            for (const m of moves) {
              const to = MOVE_TARGET[m.id];
              assert.equal(
                canTransition("REQUEST", status, to, role, isRequester, isAssignee),
                true,
                `${role} was offered "${m.id}" from ${status} (${status}→${to}) but the gate rejects it`
              );
            }
          }
        }
      }
    }
  }
});

test("availableRequestMoves: the right moves for the right actor", () => {
  const ids = (status: Status, ctx: Parameters<typeof availableRequestMoves>[1]) =>
    availableRequestMoves(status, ctx).map((m) => m.id);
  const staffCtx = { role: STAFF, isRequester: false, isAssignee: false, assigned: false };
  const adminCtx = { role: ADMIN, isRequester: false, isAssignee: false, assigned: false };
  const userCtx = { role: USER, isRequester: false, isAssignee: false, assigned: false };

  // Staff advance the pipeline; a plain USER gets nothing on staff-only stages.
  assert.deepEqual(ids("SUBMITTED", staffCtx), ["review"]);
  assert.deepEqual(ids("SUBMITTED", userCtx), []);
  assert.deepEqual(ids("UNDER_REVIEW", staffCtx), ["sendApproval"]);

  // The MD decision is admin-only (recorded on their behalf).
  assert.deepEqual(ids("PENDING_MD_APPROVAL", adminCtx), ["recordDecision"]);
  assert.deepEqual(ids("PENDING_MD_APPROVAL", staffCtx), []);

  // Claim shows only while unassigned; once assigned there's nothing to advance here.
  assert.deepEqual(ids("APPROVED", staffCtx), ["claim"]);
  assert.deepEqual(ids("APPROVED", { ...staffCtx, assigned: true }), []);

  // Release is assignee-locked — an admin who isn't the assignee can't release it,
  // but can still build (start) it.
  const assigneeStaff = { role: STAFF, isRequester: false, isAssignee: true, assigned: true };
  assert.deepEqual(ids("CLAIMED", assigneeStaff), ["startBuild", "release"]);
  assert.deepEqual(ids("CLAIMED", { ...adminCtx, assigned: true }), ["startBuild"]);

  // UAT gate: the requester owns it — accept & close, or send back for changes. The
  // list is REQUESTER-ONLY: an admin is still server-permitted to send it back (the
  // escape hatch, asserted in TRANSITION_CASES / canTransition), but that override
  // lives only in the detail (RequestUatPanel), never as a row move here — so the row
  // no longer reads as "MIS is being asked to test". Non-requester staff/admin: none.
  const requester = { role: USER, isRequester: true, isAssignee: false, assigned: true };
  assert.deepEqual(ids("IN_TESTING", requester), ["accept", "requestChanges"]);
  assert.deepEqual(ids("IN_TESTING", { ...adminCtx, assigned: true }), []);
  assert.deepEqual(ids("IN_TESTING", { ...staffCtx, assigned: true }), []);

  // A closed request is terminal for everyone.
  assert.deepEqual(ids("CLOSED", adminCtx), []);
});

/* ---------------- canMoveTicketType (§12 — moving a misfiled ticket) ------------- */

test("an ISSUE can be moved until it's resolved/closed", () => {
  assert.equal(canMoveTicketType("ISSUE", "OPEN"), true);
  assert.equal(canMoveTicketType("ISSUE", "IN_PROGRESS"), true);
  assert.equal(canMoveTicketType("ISSUE", "REOPENED"), true);
  // Blocked once work is done or the reporter is verifying — a reset would destroy it.
  assert.equal(canMoveTicketType("ISSUE", "RESOLVED"), false);
  assert.equal(canMoveTicketType("ISSUE", "CLOSED"), false);
});

test("a REQUEST can be moved until testing/closed", () => {
  assert.equal(canMoveTicketType("REQUEST", "SUBMITTED"), true);
  assert.equal(canMoveTicketType("REQUEST", "UNDER_REVIEW"), true);
  assert.equal(canMoveTicketType("REQUEST", "CLAIMED"), true);
  assert.equal(canMoveTicketType("REQUEST", "IN_PROGRESS"), true);
  assert.equal(canMoveTicketType("REQUEST", "CHANGES_REQUESTED"), true);
  // Blocked once the requester is verifying (IN_TESTING) or has accepted (CLOSED).
  assert.equal(canMoveTicketType("REQUEST", "IN_TESTING"), false);
  assert.equal(canMoveTicketType("REQUEST", "CLOSED"), false);
});

test("moveTargetType flips the module", () => {
  assert.equal(moveTargetType("ISSUE"), "REQUEST");
  assert.equal(moveTargetType("REQUEST"), "ISSUE");
});

/* ---------------- auto-close (§5) ---------------- */

test("only RESOLVED issues and IN_TESTING requests are auto-close eligible", () => {
  assert.equal(isAutoCloseEligible("ISSUE", "RESOLVED"), true);
  assert.equal(isAutoCloseEligible("ISSUE", "OPEN"), false);
  assert.equal(isAutoCloseEligible("ISSUE", "IN_PROGRESS"), false);
  assert.equal(isAutoCloseEligible("ISSUE", "CLOSED"), false);
  assert.equal(isAutoCloseEligible("REQUEST", "IN_TESTING"), true);
  assert.equal(isAutoCloseEligible("REQUEST", "IN_PROGRESS"), false);
  assert.equal(isAutoCloseEligible("REQUEST", "CLOSED"), false);
});

test("auto-close fires only after the grace window fully elapses", () => {
  const now = new Date("2026-08-20T09:00:00Z");
  const day = 86_400_000;
  // Resolved 8 days ago exactly → due; 7 days ago → still within grace.
  assert.equal(autoCloseDue(new Date(now.getTime() - AUTO_CLOSE_DAYS * day), now), true);
  assert.equal(autoCloseDue(new Date(now.getTime() - (AUTO_CLOSE_DAYS - 1) * day), now), false);
  // Just resolved → not due.
  assert.equal(autoCloseDue(now, now), false);
});


/* ------------------------------------------------------------------ *
 * Dating a completion (§5.2) — completionDateFor. ANY date is allowed, past or
 * future; only a non-date is refused.
 * ------------------------------------------------------------------ */

const NOW = new Date("2026-08-17T09:30:00Z"); // 17 Aug 2026, 15:00 IST

test("today is stamped as now, and is not a 'dated' completion", () => {
  const r = completionDateFor("2026-08-17", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.at.getTime(), NOW.getTime());
  assert.equal(r.ok && r.dated, false);
});

test("'today' is read in IST, not UTC", () => {
  // 17 Aug 02:00 IST is still 16 Aug in UTC. Reading the day in UTC would treat
  // "today" as a past date for anyone working before 05:30 IST.
  const earlyIst = new Date("2026-08-16T20:30:00Z");
  const r = completionDateFor("2026-08-17", earlyIst);
  assert.equal(r.ok && r.dated, false);
  assert.equal(r.ok && r.at.getTime(), earlyIst.getTime());
});

test("a past day lands at the end of that IST day and counts as dated", () => {
  const r = completionDateFor("2026-08-15", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.dated, true);
  // 15 Aug 23:59:59.999 IST = 18:29:59.999Z.
  assert.equal(r.ok && r.at.toISOString(), "2026-08-15T18:29:59.999Z");
});

test("a FUTURE day is accepted (product decision, §5.2) and not clamped to now", () => {
  const r = completionDateFor("2026-09-01", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.dated, true);
  assert.equal(r.ok && r.at.getTime() > NOW.getTime(), true);
  assert.equal(r.ok && r.at.toISOString(), "2026-09-01T18:29:59.999Z");
});

test("same-day completion still lands AFTER a ticket raised that morning", () => {
  // Why istDayEnd is end-of-day, not midnight: midnight would precede an 11:55 IST
  // creation and make resolved − created negative in the dashboard averages (§10).
  const raised = new Date("2026-08-13T06:25:00Z"); // 13 Aug 11:55 IST
  const r = completionDateFor("2026-08-13", NOW);
  assert.equal(r.ok && r.at.getTime() > raised.getTime(), true);
});

test("a malformed or impossible date is refused, never coerced", () => {
  for (const bad of ["", "13-08-2026", "2026-8-13", "2026-02-31", "2026-13-01", "yesterday"]) {
    assert.equal(
      completionDateFor(bad, NOW).ok,
      false,
      `expected "${bad}" to be refused`
    );
  }
});

/* ------------------------------------------------------------------ *
 * Resolving an ISSUE is MIS_ADMIN + assignee (§6) — canResolveIssue.
 * ------------------------------------------------------------------ */

test("only an MIS_ADMIN assignee may resolve an issue", () => {
  assert.equal(canResolveIssue(ADMIN, true), true);
  // An admin who isn't the assignee: resolving someone else's claim is a takeover (§6).
  assert.equal(canResolveIssue(ADMIN, false), false);
  // Staff may claim, start and release their own ticket — but not resolve it.
  assert.equal(canResolveIssue(STAFF, true), false);
  assert.equal(canResolveIssue(STAFF, false), false);
  assert.equal(canResolveIssue(USER, true), false);
});

test("the transition map agrees: → RESOLVED is admin-only", () => {
  for (const from of ["OPEN", "IN_PROGRESS", "REOPENED"] as Status[]) {
    assert.equal(canTransition("ISSUE", from, "RESOLVED", ADMIN, false, true), true);
    assert.equal(canTransition("ISSUE", from, "RESOLVED", STAFF, false, true), false);
    assert.equal(canTransition("ISSUE", from, "RESOLVED", USER, true, false), false);
  }
  // Starting work is still open to staff — only resolving was narrowed.
  assert.equal(canTransition("ISSUE", "OPEN", "IN_PROGRESS", STAFF, false, true), true);
});

/* ------------------------------------------------------------------ *
 * Dating a START (§5.3) — startDateFor. Same freedom as a completion, but it takes
 * the FIRST instant of the day rather than the last.
 * ------------------------------------------------------------------ */

test("today starts now and is not a 'dated' start", () => {
  const r = startDateFor("2026-08-17", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.at.getTime(), NOW.getTime());
  assert.equal(r.ok && r.dated, false);
});

test("a past start day lands at the START of that IST day", () => {
  const r = startDateFor("2026-08-15", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.dated, true);
  // 15 Aug 00:00 IST = 14 Aug 18:30Z.
  assert.equal(r.ok && r.at.toISOString(), "2026-08-14T18:30:00.000Z");
});

test("a FUTURE start day is accepted — no bounds either way (§5.3)", () => {
  const r = startDateFor("2026-09-01", NOW);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.dated, true);
  assert.equal(r.ok && r.at.getTime() > NOW.getTime(), true);
});

test("start and completion on the same past day give a POSITIVE duration", () => {
  // The reason the two take opposite ends of the day: same-day start→finish would
  // otherwise collapse to zero (both end-of-day) or go negative (both start-of-day).
  const start = startDateFor("2026-08-15", NOW);
  const done = completionDateFor("2026-08-15", NOW);
  assert.equal(start.ok && done.ok && done.at.getTime() > start.at.getTime(), true);
});

test("'today' is read in IST for starts too", () => {
  const earlyIst = new Date("2026-08-16T20:30:00Z"); // 17 Aug 02:00 IST
  const r = startDateFor("2026-08-17", earlyIst);
  assert.equal(r.ok && r.dated, false);
  assert.equal(r.ok && r.at.getTime(), earlyIst.getTime());
});

test("a malformed or impossible start date is refused, never coerced", () => {
  for (const bad of ["", "17-08-2026", "2026-8-17", "2026-02-31", "tomorrow"]) {
    assert.equal(
      startDateFor(bad, NOW).ok,
      false,
      `expected "${bad}" to be refused`
    );
  }
});

/* ------------------------------------------------------------------ *
 * The claim date reuses startDateFor (§5.3) — it is the earliest bound of the
 * lifecycle, so claim ≤ start ≤ completion can never invert on the same day.
 * ------------------------------------------------------------------ */

test("claim ≤ start ≤ completion holds when all three are the same past day", () => {
  const claimed = startDateFor("2026-08-15", NOW);
  const started = startDateFor("2026-08-15", NOW);
  const done = completionDateFor("2026-08-15", NOW);
  assert.equal(claimed.ok && started.ok && done.ok, true);
  if (claimed.ok && started.ok && done.ok) {
    assert.equal(claimed.at.getTime() <= started.at.getTime(), true);
    assert.equal(started.at.getTime() < done.at.getTime(), true);
  }
});

test("a claim dated to a past day is flagged for the audit row; today is not", () => {
  // `dated` only exists on the ok branch, so narrow before reading it.
  const past = startDateFor("2026-08-10", NOW);
  const today = startDateFor("2026-08-17", NOW);
  assert.equal(past.ok && past.dated, true);
  assert.equal(today.ok && today.dated, false);
});
