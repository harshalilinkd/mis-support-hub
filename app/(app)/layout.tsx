import { redirect } from "next/navigation";

import {
  countAssignedActive,
  countMyActiveTickets,
  listNotificationsWithUnread,
} from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isStaff = user.role === "MIS_STAFF" || user.role === "MIS_ADMIN";
  const [notif, myActiveCount] = await Promise.all([
    listNotificationsWithUnread(user.id),
    isStaff ? countAssignedActive(user.id) : countMyActiveTickets(user.id),
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
      <AppShell
        user={user}
        notifications={notifications}
        unreadCount={unreadCount}
        myActiveCount={myActiveCount}
      >
        {children}
      </AppShell>
    </>
  );
}
