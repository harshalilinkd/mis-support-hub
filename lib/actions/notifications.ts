"use server";

import { markAllNotificationsRead } from "@/lib/db/queries";
import { getCurrentUser } from "@/lib/session";

/** Mark the current user's unread notifications as read (best-effort). */
export async function markNotificationsRead(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  try {
    await markAllNotificationsRead(user.id);
  } catch (e) {
    console.error("[markNotificationsRead]", e);
  }
}
