/**
 * The invite-only sign-in decision (CLAUDE.md §7), as a PURE function.
 *
 * It lives here rather than inline in the `signIn` callback for the same reason
 * `lib/ticket-state.ts` exists: this is a security boundary, so it gets a single
 * source of truth with unit tests behind it (see auth-gate.test.ts). No DB, no
 * env, no Auth.js — the caller supplies the facts.
 *
 * The rule: membership is the gate, not the email domain. A domain allowlist
 * cannot gate this organisation — the team signs in with personal Gmail, so
 * ALLOWED_EMAIL_DOMAINS="gmail.com" would admit nearly every Google account and an
 * empty list admits everyone. The domain filter is an OPTIONAL extra restriction
 * layered on top, never the thing keeping strangers out.
 */
export function canSignIn(args: {
  /** The email attempting to sign in (any case; trimmed/lowercased here). */
  email: string;
  /** The existing `users` row for that email, or null if there is none. */
  user: { isActive: boolean } | null;
  /** ADMIN_EMAILS — the bootstrap allowlist, already lowercased. */
  adminEmails: string[];
  /** Result of the optional ALLOWED_EMAIL_DOMAINS filter. True when unset/empty. */
  domainAllowed: boolean;
}): boolean {
  const email = args.email.trim().toLowerCase();
  // No email = nothing to check a membership against.
  if (!email) return false;

  const isBootstrap = args.adminEmails.includes(email);

  // The optional domain filter applies to everyone EXCEPT a bootstrap admin. That
  // exemption is the whole point of the bootstrap: it is the recovery hatch, and a
  // hatch that a config change can lock is not a hatch. Without it, setting
  // ALLOWED_EMAIL_DOMAINS to a domain the admins don't use (easy to do — the docs
  // used to instruct exactly that) locks out every user AND the only account that
  // could add them back, with no way in through the UI.
  if (!args.domainAllowed && !isBootstrap) return false;

  // Known account: the only question is whether it's still active. Checked BEFORE
  // the bootstrap list, so deactivating an ADMIN_EMAILS address still locks them
  // out — otherwise removing an admin would silently do nothing.
  if (args.user) return args.user.isActive;

  // Unknown account: admitted only as a bootstrap admin. Everyone else must be
  // invited by an admin first (Settings → Users).
  return isBootstrap;
}
