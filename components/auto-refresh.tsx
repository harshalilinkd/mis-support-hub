"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the current page's server data fresh without a manual refresh, so a
 * ticket raised on one screen shows up on the MIS screen (and vice-versa) on
 * its own. Uses a soft router.refresh() — it re-fetches the Server Components
 * but PRESERVES client state (search text, form inputs, scroll, open menus).
 *
 * - Polls every `intervalMs` while the tab is visible (skips work when hidden).
 * - Refreshes immediately when the tab regains focus/visibility (the common
 *   case: switching back to the MIS tab).
 *
 * This is near-real-time (poll-based), not push. True instant updates would
 * need a realtime channel (SSE/WebSocket via a service like Pusher/Ably).
 */
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);

    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, intervalMs]);

  return null;
}
