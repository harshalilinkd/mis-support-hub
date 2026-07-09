/**
 * Company email-domain allowlist (CLAUDE.md §7). Single source of truth for
 * BOTH Google SSO (lib/auth.config.ts) and email+password sign-up
 * (lib/actions/auth.ts), so the domain guard can never drift between them.
 *
 * Reads `ALLOWED_EMAIL_DOMAINS` (comma-separated). Empty = allow any account
 * (local-dev convenience). Imports nothing server-only, so it is edge-safe.
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
