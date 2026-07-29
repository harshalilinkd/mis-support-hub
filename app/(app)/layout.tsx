import { redirect } from "next/navigation";

import {
  countAssignedActive,
  countMyActiveTickets,
  countPendingAccessRequests,
  listNotificationsWithUnread,
} from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { NotificationWatcher } from "@/components/notification-watcher";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isStaff = user.role === "MIS_STAFF" || user.role === "MIS_ADMIN";
  const isAdmin = user.role === "MIS_ADMIN";
  const [notif, myActiveCount, pendingAccessCount] = await Promise.all([
    listNotificationsWithUnread(user.id),
    isStaff ? countAssignedActive(user.id) : countMyActiveTickets(user.id),
    // Only admins see Settings / the access-requests queue, so only they pay for it.
    isAdmin ? countPendingAccessRequests() : Promise.resolve(0),
  ]);
  const unreadCount = notif.unread;
  const notifications = notif.rows.map((n) => ({
    id: n.id,
    ticketNumber: n.ticketNumber,
    title: n.title,
    body: n.body,
    readAt: n.readAt ? toIso(n.readAt) : null,
    createdAt: toIso(n.createdAt),
  }));

  return (
    <>
      {/* Keeps every screen's data fresh (poll + on-focus) so tickets raised on
          one screen appear on the MIS screen without a manual refresh. */}
      <AutoRefresh />
      {/* The single notification detector: polls a light count endpoint even while
          the tab is hidden, then chimes + toasts (visible) or fires an OS desktop
          notification (backgrounded) and keeps the favicon badge current. */}
      <NotificationWatcher initialUnread={unreadCount} />
      <AppShell
        user={user}
        notifications={notifications}
        unreadCount={unreadCount}
        myActiveCount={myActiveCount}
        pendingAccessCount={pendingAccessCount}
      >
        {children}
      </AppShell>
    </>
  );
}
