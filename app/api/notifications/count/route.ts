import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/session";
import { notificationSignal } from "@/lib/db/queries";

/**
 * The notification signal the client <NotificationWatcher> polls — deliberately
 * lighter than the RSC layout (§8). It returns the viewer's unread count plus the
 * newest unread row's content, so the watcher can raise a desktop notification /
 * favicon badge even while the tab is HIDDEN (where router.refresh, and therefore
 * the layout's unreadCount prop, does not update — the primary reason the chime was
 * silent). Read-only; scoped to the caller's own rows via getCurrentUser().
 */
export async function GET(): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const signal = await notificationSignal(user.id);
  // Never let the browser or a CDN serve a stale count — the whole point is freshness.
  return NextResponse.json(signal, {
    headers: { "Cache-Control": "no-store" },
  });
}
