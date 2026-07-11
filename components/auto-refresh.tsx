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
    // Switching back to a tab fires BOTH `focus` and `visibilitychange`, and can
    // coincide with an interval tick — coalesce all triggers to at most one
    // refresh per 2s so a single tab-switch doesn't refetch the page 2-3×.
    let last = 0;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - last < 2000) return;
      last = now;
      router.refresh();
    };

    const id = setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      clearInterval(id);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, intervalMs]);

  return null;
}
