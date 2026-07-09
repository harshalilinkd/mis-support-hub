"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import { markNotificationsRead } from "@/lib/actions/notifications";
import { cn } from "@/lib/utils";
import { RelativeTime } from "@/components/relative-time";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type BellNotification = {
  id: string;
  ticketNumber: string | null;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: BellNotification[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [unread, setUnread] = useState(unreadCount);

  useEffect(() => setUnread(unreadCount), [unreadCount]);

  function handleOpenChange(open: boolean) {
    if (open && unread > 0) {
      setUnread(0); // optimistic
      startTransition(async () => {
        await markNotificationsRead();
        router.refresh();
      });
    }
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className="relative"
        >
          <Bell className="size-4" />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-sm font-medium">
          Notifications
        </div>
        {notifications.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-text-muted">
            You’re all caught up.
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {notifications.map((n) => {
              const isUnread = !n.readAt;
              const inner = (
                <div
                  className={cn(
                    "flex gap-2 px-3 py-2.5",
                    isUnread && "bg-accent-soft/40"
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      isUnread ? "bg-primary" : "bg-transparent"
                    )}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body ? (
                      <div className="truncate text-xs text-text-muted">
                        {n.body}
                      </div>
                    ) : null}
                    <RelativeTime
                      date={n.createdAt}
                      className="text-xs text-text-muted"
                    />
                  </div>
                </div>
              );
              return (
                <li key={n.id} className="border-b border-border last:border-0">
                  {n.ticketNumber ? (
                    <Link
                      href={`/tickets/${n.ticketNumber}`}
                      className="block transition-colors hover:bg-surface-muted"
                    >
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
