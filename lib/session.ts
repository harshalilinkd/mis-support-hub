import { cache } from "react";
import type { Session } from "next-auth";

import { auth } from "@/lib/auth";
import { ensureUserRow, getUserById } from "@/lib/db/queries";
import type { Department, Role } from "@/lib/db/schema";
import { DEV_STUB_ENABLED, DEV_STUB_USER } from "@/lib/dev-session";

// Ensure the dev-stub users row exists exactly once per process, so writes that
// FK-reference it (tickets, comments, activity) succeed. Best-effort: a failure
// is logged and retried on the next request rather than crashing the app.
let devStubEnsured: Promise<void> | null = null;
function ensureDevStubUser(): Promise<void> {
  if (!devStubEnsured) {
    devStubEnsured = ensureUserRow(DEV_STUB_USER).catch((error) => {
      devStubEnsured = null;
      console.error("[dev-stub] could not ensure users row", error);
    });
  }
  return devStubEnsured;
}

export type SessionUser = {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  department: Department | null;
};

/**
 * The effective app user for a request: the real signed-in user, or the dev
 * stub when enabled. Enforces is_active (a deactivated user resolves to null).
 * Role is read fresh from the DB so promotions/demotions take effect immediately.
 *
 * cache() dedupes the work across the layout + page in a single render pass.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  let session: Session | null = null;
  try {
    session = await auth();
  } catch (error) {
    // A stale/undecryptable session cookie (rotated AUTH_SECRET, an Auth.js
    // version change, or a cookie left by another app on localhost) must never
    // crash the app — treat it as signed-out and fall through to the dev stub.
    console.error("[getCurrentUser] session decode failed; treating as signed-out", error);
  }
  if (session?.user) {
    const dbUser = await getUserById(session.user.id);
    if (!dbUser?.isActive) return null;
    return {
      id: session.user.id,
      role: dbUser.role,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
      department: dbUser.department,
    };
  }
  if (DEV_STUB_ENABLED) {
    await ensureDevStubUser();
    return DEV_STUB_USER;
  }
  return null;
});
