/**
 * A dynamic favicon: the cobalt brand mark, with a red unread badge painted on when
 * there are unread notifications. Unlike the in-tab chime and toast, a tab-strip icon
 * stays visible when the tab is BACKGROUNDED — a glance shows there's something new,
 * with no permission and no gesture required. Drawn on a canvas and swapped into the
 * <link rel="icon">; the app ships no static favicon, so this also fills that gap.
 *
 * Client-only. All work is in an effect (never during render), so there is no SSR /
 * hydration concern — the server never emits this icon.
 */

const COBALT = "#2563eb";
const ALERT = "#ef4444";

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Repaint the favicon for the given unread count. count<=0 renders the plain mark. */
export function applyFaviconBadge(count: number): void {
  if (typeof document === "undefined") return;
  try {
    const S = 64;
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const c = canvas.getContext("2d");
    if (!c) return;

    // Brand: cobalt rounded square with a white "M" (MIS).
    roundRect(c, 2, 2, S - 4, S - 4, 14);
    c.fillStyle = COBALT;
    c.fill();
    c.fillStyle = "#ffffff";
    c.font = "700 38px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("M", S / 2, S / 2 + 2);

    if (count > 0) {
      // Alert badge, top-right. A dot reads at 16px; a single digit still fits.
      const r = 17;
      const cx = S - r - 1;
      const cy = r + 1;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fillStyle = ALERT;
      c.fill();
      // Ring so the badge separates from the cobalt beneath it.
      c.lineWidth = 3;
      c.strokeStyle = "#ffffff";
      c.stroke();
      c.fillStyle = "#ffffff";
      c.font = "700 26px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif";
      c.fillText(count > 9 ? "9+" : String(count), cx, cy + 1);
    }

    const url = canvas.toDataURL("image/png");
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/png";
    link.href = url;
  } catch {
    /* canvas unavailable or blocked — the toast/desktop channels still cover it */
  }
}
