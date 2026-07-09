import type { Department, Role } from "@/lib/db/schema";

/**
 * Dev-only session stub. Lets the app shell render before Google OAuth is
 * configured. NEVER active in production: gated on NODE_ENV *and* an explicit
 * env flag. Toggle with DEV_AUTH_STUB=true in .env.local.
 *
 * The real Auth.js session is always the primary source of truth (see
 * lib/session.ts); this stub is only used as a fallback when no real session
 * exists AND the flag is set. Set DEV_AUTH_STUB="" (and configure Google) to
 * use real sign-in only.
 *
 * This file imports no server-only modules (only a type), so it is safe to
 * import from edge middleware.
 */
export const DEV_STUB_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_STUB === "true";

// Optional overrides to exercise role-gated / owner-scoped UI in dev without
// real accounts: DEV_STUB_ROLE=USER|MIS_STAFF|MIS_ADMIN (default MIS_ADMIN),
// and DEV_STUB_ID=<a real users.id> to impersonate a seeded user.
const stubRole = (process.env.DEV_STUB_ROLE as Role | undefined) || "MIS_ADMIN";
const stubId =
  process.env.DEV_STUB_ID || "00000000-0000-0000-0000-000000000000";

export const DEV_STUB_USER = {
  id: stubId,
  role: stubRole,
  name: "Dev User",
  email: "dev@localhost",
  image: null as string | null,
  department: "LINKD" as Department | null,
};
