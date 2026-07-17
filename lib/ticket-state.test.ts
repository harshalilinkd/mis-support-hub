import test from "node:test";
import assert from "node:assert/strict";

import type { Role, Status } from "@/lib/db/schema";
import { assertStatusForType, canTransition } from "./ticket-state";

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
  ["IN_TESTING", "APPROVED"],
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
  assert.equal(canTransition("ISSUE", "IN_PROGRESS", "RESOLVED", STAFF, false, false), true);
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
