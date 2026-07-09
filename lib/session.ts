import { cache } from "react";
import type { Session } from "next-auth";

import { auth } from "@/lib/auth";
import { getUserById } from "@/lib/db/queries";
import type { Role } from "@/lib/db/schema";
import { DEV_STUB_ENABLED, DEV_STUB_USER } from "@/lib/dev-session";

export type SessionUser = {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
  image?: string | null;
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
    };
  }
  if (DEV_STUB_ENABLED) return DEV_STUB_USER;
  return null;
});
