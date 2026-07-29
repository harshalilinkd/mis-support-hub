import test from "node:test";
import assert from "node:assert/strict";

import { canSignIn, shouldRequestAccess } from "./auth-gate";

/**
 * Guardrail tests for the invite-only sign-in gate (CLAUDE.md §7). Pure — no DB.
 * Run with `npm test`.
 *
 * The two failure modes this protects against are opposites, and both are severe:
 * letting a stranger in, and locking the real team out.
 */

const ADMINS = ["boss@gmail.com"];
const active = { isActive: true };
const inactive = { isActive: false };
/** The normal shape: ALLOWED_EMAIL_DOMAINS unset, so the domain filter passes all. */
const open = { domainAllowed: true };

test("an invited, active account may sign in", () => {
  assert.equal(canSignIn({ email: "nikita@gmail.com", user: active, adminEmails: [], ...open }), true);
  // Case and stray whitespace from the provider profile must not matter.
  assert.equal(canSignIn({ email: " Nikita@Gmail.com ", user: active, adminEmails: [], ...open }), true);
});

test("a stranger with no account is refused", () => {
  // The whole point of the gate: an unknown email does NOT self-provision.
  assert.equal(canSignIn({ email: "stranger@gmail.com", user: null, adminEmails: ADMINS, ...open }), false);
});

test("a deactivated account is refused", () => {
  assert.equal(canSignIn({ email: "gone@gmail.com", user: inactive, adminEmails: [], ...open }), false);
});

test("ADMIN_EMAILS bootstraps an account that does not exist yet", () => {
  // Without this, a fresh deploy with an empty users table admits nobody and the
  // only fix is a UI you cannot reach — an unrecoverable lockout.
  assert.equal(canSignIn({ email: "boss@gmail.com", user: null, adminEmails: ADMINS, ...open }), true);
  assert.equal(canSignIn({ email: "BOSS@gmail.com", user: null, adminEmails: ADMINS, ...open }), true);
});

test("deactivation beats the ADMIN_EMAILS bootstrap", () => {
  // Regression: if the bootstrap were checked first, deactivating an admin listed
  // in ADMIN_EMAILS would silently do nothing and they'd walk back in.
  assert.equal(canSignIn({ email: "boss@gmail.com", user: inactive, adminEmails: ADMINS, ...open }), false);
});

test("an empty or missing email is refused", () => {
  assert.equal(canSignIn({ email: "", user: null, adminEmails: ADMINS, ...open }), false);
  assert.equal(canSignIn({ email: "   ", user: null, adminEmails: ADMINS, ...open }), false);
  // An empty ADMIN_EMAILS entry must never match an empty email into a bypass.
  assert.equal(canSignIn({ email: "", user: null, adminEmails: [""], ...open }), false);
});

test("an empty ADMIN_EMAILS list still admits existing users", () => {
  // The normal production shape once the team is set up: bootstrap unused, but
  // everyone with a row keeps working.
  assert.equal(canSignIn({ email: "nikita@gmail.com", user: active, adminEmails: [], ...open }), true);
  assert.equal(canSignIn({ email: "stranger@gmail.com", user: null, adminEmails: [], ...open }), false);
});

test("the domain filter restricts invited users but never the bootstrap admin", () => {
  // Regression for a real trap: the docs used to instruct setting
  // ALLOWED_EMAIL_DOMAINS in production. With this team on personal Gmail that
  // refuses everyone — and if it could also refuse the bootstrap admin, nobody
  // could add anyone back and the deployment would be bricked from the UI.
  const blocked = { domainAllowed: false };
  // An invited user outside the configured domain is refused (the filter works)...
  assert.equal(canSignIn({ email: "nikita@gmail.com", user: active, adminEmails: ADMINS, ...blocked }), false);
  // ...but the recovery hatch survives, so the config is always undoable.
  assert.equal(canSignIn({ email: "boss@gmail.com", user: null, adminEmails: ADMINS, ...blocked }), true);
  assert.equal(canSignIn({ email: "boss@gmail.com", user: active, adminEmails: ADMINS, ...blocked }), true);
  // The exemption is for the bootstrap, not a hole: a stranger is still refused,
  // and a deactivated bootstrap admin stays out.
  assert.equal(canSignIn({ email: "stranger@evil.com", user: null, adminEmails: ADMINS, ...blocked }), false);
  assert.equal(canSignIn({ email: "boss@gmail.com", user: inactive, adminEmails: ADMINS, ...blocked }), false);
});

/* ---------------- shouldRequestAccess (§7, the request-to-join path) ------------- */

const google = { provider: "google" };

test("a genuine new Google stranger's refused sign-in files a request", () => {
  assert.equal(
    shouldRequestAccess({ ...google, email: "new@gmail.com", user: null, adminEmails: ADMINS, ...open }),
    true
  );
  // Case/whitespace from the provider profile must not matter.
  assert.equal(
    shouldRequestAccess({ ...google, email: " New@Gmail.com ", user: null, adminEmails: [], ...open }),
    true
  );
});

test("a deactivated or demoted member never re-requests their way back in", () => {
  // The critical one: a removed user's refusal is an admin's choice. Turning it into
  // a fresh 'request' would let them nag to be re-approved — exactly what §7 forbids.
  assert.equal(
    shouldRequestAccess({ ...google, email: "gone@gmail.com", user: inactive, adminEmails: [], ...open }),
    false
  );
  // An active member with a row doesn't request either — they just sign in.
  assert.equal(
    shouldRequestAccess({ ...google, email: "nikita@gmail.com", user: active, adminEmails: [], ...open }),
    false
  );
});

test("a bootstrap admin gets in directly, so files no request", () => {
  assert.equal(
    shouldRequestAccess({ ...google, email: "boss@gmail.com", user: null, adminEmails: ADMINS, ...open }),
    false
  );
});

test("only Google files a request — the password door stays invite-only", () => {
  assert.equal(
    shouldRequestAccess({ provider: "credentials", email: "new@gmail.com", user: null, adminEmails: [], ...open }),
    false
  );
});

test("the domain filter also blocks queuing a request, and empty email files none", () => {
  const blocked = { domainAllowed: false };
  assert.equal(
    shouldRequestAccess({ ...google, email: "new@evil.com", user: null, adminEmails: ADMINS, ...blocked }),
    false
  );
  assert.equal(
    shouldRequestAccess({ ...google, email: "", user: null, adminEmails: [], ...open }),
    false
  );
});
