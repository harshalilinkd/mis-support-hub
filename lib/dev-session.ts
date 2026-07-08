import type { Role } from "@/lib/db/schema";

/**
 * Dev-only session stub (P0). Lets the app shell render before Google OAuth is
 * configured. NEVER active in production: gated on NODE_ENV *and* an explicit
 * env flag. Toggle with DEV_AUTH_STUB=true in .env.local.
 *
 * This file imports no server-only modules (only a type), so it is safe to
 * import from edge middleware.
 */
export const DEV_STUB_ENABLED =
  process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_STUB === "true";

export const DEV_STUB_USER = {
  id: "00000000-0000-0000-0000-000000000000",
  role: "MIS_ADMIN" as Role,
  name: "Dev Admin",
  email: "dev@localhost",
  image: null as string | null,
};
