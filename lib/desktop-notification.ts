/**
 * Desktop (OS) notifications via the Web Notifications API — the ONE attention
 * channel that reaches a user whose MIS tab is BACKGROUNDED or the browser is behind
 * another window. The OS plays the alert sound itself, so it is exempt from the
 * autoplay policy that silences the in-tab Web-Audio chime in a hidden tab (the
 * primary cause behind "I don't hear any sound").
 *
 * This is the foreground tier: new Notification() fired from the open tab, no service
 * worker. It therefore covers "tab backgrounded / browser not focused" but NOT "tab
 * fully closed" — that needs a Service Worker + Web Push (new infra; deferred).
 *
 * Client-only. Permission MUST be requested from a user gesture (a button), never on
 * load. A localStorage pref lets the user turn alerts off without revoking the OS
 * permission — mirroring the mute flag in notification-sound.ts.
 */

const ENABLED_KEY = "mis:desktop-alerts";

export type DesktopPermission = NotificationPermission | "unsupported";

export function desktopSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function desktopPermission(): DesktopPermission {
  if (!desktopSupported()) return "unsupported";
  return Notification.permission;
}

/** Enabled = OS permission granted AND the user hasn't switched alerts off. */
export function desktopAlertsEnabled(): boolean {
  if (desktopPermission() !== "granted") return false;
  try {
    return localStorage.getItem(ENABLED_KEY) !== "0";
  } catch {
    return true;
  }
}

export function setDesktopAlertsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/**
 * Ask the OS for permission (call from a click). On grant, alerts default ON.
 * Resolves to the resulting permission so the caller can update its UI.
 */
export async function requestDesktopAlerts(): Promise<DesktopPermission> {
  if (!desktopSupported()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") setDesktopAlertsEnabled(true);
    return result;
  } catch {
    return desktopPermission();
  }
}

/**
 * Show one OS notification, if permitted and enabled. Clicking it focuses this tab
 * and navigates to the deep link. A stable `tag` collapses a burst into one toast
 * rather than stacking N of them — the in-app bell holds the full list.
 */
export function showDesktopNotification(input: {
  title: string;
  body?: string | null;
  tag?: string;
  url?: string;
}): void {
  if (!desktopAlertsEnabled()) return;
  try {
    const n = new Notification(input.title, {
      body: input.body ?? undefined,
      tag: input.tag ?? "mis-notification",
      // No custom icon path (the app ships none); the OS uses the browser/site icon.
    });
    n.onclick = () => {
      try {
        window.focus();
        if (input.url) window.location.href = input.url;
      } finally {
        n.close();
      }
    };
  } catch {
    /* constructing a Notification can throw on some platforms — best-effort */
  }
}
