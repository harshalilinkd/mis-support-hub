import { cache } from "react";

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
  const session = await auth();
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
