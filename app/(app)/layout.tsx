import { redirect } from "next/navigation";

import { listNotifications, unreadNotificationCount } from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [rows, unreadCount] = await Promise.all([
    listNotifications(user.id),
    unreadNotificationCount(user.id),
  ]);
  const notifications = rows.map((n) => ({
    id: n.id,
    ticketNumber: n.ticketNumber,
    title: n.title,
    body: n.body,
    readAt: n.readAt ? toIso(n.readAt) : null,
    createdAt: toIso(n.createdAt),
  }));

  return (
    <AppShell user={user} notifications={notifications} unreadCount={unreadCount}>
      {children}
    </AppShell>
  );
}
