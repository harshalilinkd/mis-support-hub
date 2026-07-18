"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, MonitorSmartphone, Play, Volume2, VolumeX } from "lucide-react";

import { markNotificationsRead } from "@/lib/actions/notifications";
import {
  isSoundMuted,
  setSoundMuted,
  testNotificationChime,
} from "@/lib/notification-sound";
import {
  type DesktopPermission,
  desktopAlertsEnabled,
  desktopPermission,
  requestDesktopAlerts,
  setDesktopAlertsEnabled,
} from "@/lib/desktop-notification";
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
  const [muted, setMuted] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [desktopPerm, setDesktopPerm] = useState<DesktopPermission>("default");
  const [desktopOn, setDesktopOn] = useState(false);
  const prevUnread = useRef(unreadCount);

  useEffect(() => setUnread(unreadCount), [unreadCount]);

  // Reflect stored prefs on mount. Audio priming + the actual chime/toast/desktop
  // alerting now live in <NotificationWatcher> (the single detector); the bell is the
  // visible control surface and the badge/list.
  useEffect(() => {
    setMuted(isSoundMuted());
    setDesktopPerm(desktopPermission());
    setDesktopOn(desktopAlertsEnabled());
  }, []);

  // Pulse the bell when the unread count rises (visible-tab polish) — never on the
  // initial mount, never when the count drops (marking read). When visible, the
  // watcher's router.refresh() feeds this prop, so the pulse tracks the alert.
  useEffect(() => {
    if (unreadCount > prevUnread.current) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 1400);
      prevUnread.current = unreadCount;
      return () => clearTimeout(t);
    }
    prevUnread.current = unreadCount;
  }, [unreadCount]);

  function toggleMute() {
    setMuted((m) => {
      const next = !m;
      setSoundMuted(next);
      return next;
    });
  }

  async function toggleDesktop() {
    if (desktopPerm === "granted") {
      const next = !desktopOn;
      setDesktopAlertsEnabled(next);
      setDesktopOn(next);
      return;
    }
    // "default" → ask the OS (this click is the required gesture). "denied" is handled
    // by disabling the button below, so we never reach here for it.
    const result = await requestDesktopAlerts();
    setDesktopPerm(result);
    setDesktopOn(desktopAlertsEnabled());
  }

  function handleOpenChange(open: boolean) {
    if (open) {
      setPulse(false);
      if (unread > 0) {
        setUnread(0); // optimistic
        startTransition(async () => {
          await markNotificationsRead();
          router.refresh();
        });
      }
    }
  }

  const desktopLabel =
    desktopPerm === "denied"
      ? "Desktop alerts blocked — enable notifications in your browser settings"
      : desktopPerm === "granted"
        ? desktopOn
          ? "Desktop alerts on — click to turn off"
          : "Desktop alerts off — click to turn on"
        : "Enable desktop alerts (get notified when this tab isn't focused)";

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
          className="relative"
        >
          <Bell className={cn("size-4 transition-transform", pulse && "motion-safe:animate-pulse")} />
          {unread > 0 ? (
            <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-4 text-primary-foreground">
              {/* A one-shot ping ring on arrival draws the eye to the badge. */}
              {pulse ? (
                <span
                  aria-hidden
                  className="absolute inset-0 rounded-full bg-primary motion-safe:animate-ping"
                />
              ) : null}
              <span className="relative">{unread > 9 ? "9+" : unread}</span>
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          <div className="flex items-center gap-0.5">
            {/* Test / unlock the chime — the click is also the gesture that unlocks
                the AudioContext so later chimes aren't blocked by autoplay. */}
            <button
              type="button"
              onClick={testNotificationChime}
              aria-label="Test notification sound"
              title="Test sound"
              className="grid size-6 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              <Play className="size-3.5" />
            </button>
            {/* Desktop (OS) alerts — the only channel that reaches you when this tab
                isn't focused. Hidden entirely where the browser has no support. */}
            {desktopPerm !== "unsupported" ? (
              <button
                type="button"
                onClick={toggleDesktop}
                disabled={desktopPerm === "denied"}
                aria-label={desktopLabel}
                title={desktopLabel}
                aria-pressed={desktopPerm === "granted" ? desktopOn : undefined}
                className={cn(
                  "grid size-6 place-items-center rounded-md transition-colors hover:bg-surface-muted",
                  desktopPerm === "granted" && desktopOn
                    ? "text-primary"
                    : "text-text-muted hover:text-foreground",
                  desktopPerm === "denied" && "cursor-not-allowed opacity-40"
                )}
              >
                <MonitorSmartphone className="size-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={toggleMute}
              aria-label={
                muted ? "Unmute notification sound" : "Mute notification sound"
              }
              title={muted ? "Sound off — click to unmute" : "Sound on — click to mute"}
              className="grid size-6 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              {muted ? (
                <VolumeX className="size-3.5" />
              ) : (
                <Volume2 className="size-3.5" />
              )}
            </button>
          </div>
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
                    {/* Body may carry multiple lines (e.g. ticket subject on the
                        first line, then the detail); render each on its own
                        truncated row so the subject is always visible. */}
                    {n.body
                      ? n.body.split("\n").map((line, i) => (
                          <div
                            key={i}
                            className={cn(
                              "truncate text-xs",
                              i === 0 ? "text-foreground/80" : "text-text-muted"
                            )}
                          >
                            {line}
                          </div>
                        ))
                      : null}
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
