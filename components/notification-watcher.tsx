"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  playNotificationChime,
  primeNotificationSound,
} from "@/lib/notification-sound";
import { showDesktopNotification } from "@/lib/desktop-notification";
import { applyFaviconBadge } from "@/lib/favicon-badge";

type Signal = {
  unread: number;
  latest: { title: string; body: string | null; ticketNumber: string | null } | null;
};

/**
 * The SINGLE detector for "a new notification arrived", decoupled from the
 * visibility-gated RSC refresh that used to be the only trigger — which is why the
 * chime never fired in a backgrounded tab (the primary diagnosis). It polls the
 * lightweight /api/notifications/count endpoint on its own interval (running even
 * while hidden; the browser throttles it, which is fine for a desktop/favicon
 * signal) and, when the unread count RISES, fans out to the right channel for the
 * tab's state:
 *   - always: repaint the favicon badge (visible in the tab strip when backgrounded)
 *   - tab visible: chime + in-app toast + router.refresh() to sync the bell list
 *   - tab hidden:  an OS desktop notification (its sound bypasses the autoplay policy)
 *
 * The bell still renders the badge/list from the server prop; this component owns the
 * ALERTING. Mounted once in the app layout.
 */
export function NotificationWatcher({
  initialUnread,
  pollMs = 15000,
}: {
  initialUnread: number;
  pollMs?: number;
}) {
  const router = useRouter();
  const prevUnread = useRef(initialUnread);

  useEffect(() => {
    // Unlock audio on first gesture + keep it alive across tab focus (this component
    // owns playback now, so it owns priming).
    const unprime = primeNotificationSound();
    // Seed the tab-strip badge immediately from the server's count.
    applyFaviconBadge(initialUnread);

    let cancelled = false;
    let controller: AbortController | null = null;

    const poll = async () => {
      controller?.abort();
      controller = new AbortController();
      let signal: Signal;
      try {
        const res = await fetch("/api/notifications/count", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok) return; // 401 while signed out, etc. — ignore quietly
        signal = (await res.json()) as Signal;
      } catch {
        return; // network blip / aborted — try again next tick
      }
      if (cancelled) return;

      const { unread, latest } = signal;
      applyFaviconBadge(unread); // reflect the current count in all states

      if (unread > prevUnread.current) {
        const url = latest?.ticketNumber ? `/tickets/${latest.ticketNumber}` : undefined;
        const newCount = unread - prevUnread.current;

        if (document.visibilityState === "visible") {
          void playNotificationChime(); // respects the mute pref
          const firstLine = latest?.body?.split("\n")[0] ?? undefined;
          toast(latest?.title ?? "New notification", {
            description:
              newCount > 1 && firstLine
                ? `${firstLine}  ·  +${newCount - 1} more`
                : firstLine ?? (newCount > 1 ? `${newCount} new notifications` : undefined),
            action: url
              ? { label: "View", onClick: () => router.push(url) }
              : undefined,
          });
          // Sync the bell's list/badge (its data comes from the server layout prop).
          router.refresh();
        } else {
          // Backgrounded: the one channel that can reach them. The OS plays the sound.
          showDesktopNotification({
            title: latest?.title ?? "New notification",
            body:
              newCount > 1
                ? `${latest?.body?.split("\n")[0] ?? "You have new notifications"}  (+${newCount - 1} more)`
                : latest?.body ?? undefined,
            tag: "mis-notification",
            url,
          });
        }
      }
      prevUnread.current = unread;
    };

    const id = setInterval(poll, pollMs);
    // Catch up the moment the tab regains focus (backgrounded polls were throttled).
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(id);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      unprime();
    };
    // initialUnread only seeds the ref; re-running on prop change would reset the
    // baseline and could double-fire. Intentionally mount-once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, router]);

  return null; // alerting only — the bell renders the visible badge/list
}
