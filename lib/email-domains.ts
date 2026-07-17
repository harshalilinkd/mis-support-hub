/**
 * Company email-domain allowlist (CLAUDE.md §7). Single source of truth for BOTH
 * the sign-in filter (lib/auth.config.ts) and admin account creation
 * (lib/actions/users.ts), so the domain guard can never drift between them.
 *
 * Reads `ALLOWED_EMAIL_DOMAINS` (comma-separated). Empty = no domain filter, which
 * is the normal configuration — this is an OPTIONAL extra filter, never the thing
 * keeping strangers out. The real gate is invite-only membership in `signIn`
 * (lib/auth.ts, §7); an empty list here does NOT mean the app is open.
 * Imports nothing server-only, so it is edge-safe.
 */
export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

/** True if `email`'s domain is permitted (or no allowlist is configured). */
export function isEmailDomainAllowed(email: string): boolean {
  const domains = allowedEmailDomains();
  if (domains.length === 0) return true;
  const domain = (email.split("@")[1] ?? "").toLowerCase();
  return domains.includes(domain);
}
