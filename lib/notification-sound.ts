/**
 * A notification chime synthesized with the Web Audio API — no audio asset to ship
 * or host. One shared AudioContext, primed on the first user gesture so later chimes
 * aren't blocked by the browser's autoplay policy. Client-only: every function
 * touches `window`, so call these from effects/handlers.
 *
 * Hardened after the "I don't hear any sound" report (see the notification-attention
 * diagnosis): the chime now (a) AWAITS resume() before scheduling — the old code
 * scheduled notes against a still-suspended, frozen-clock context and silently
 * dropped them; (b) is louder with a cut-through timbre and a double-tap so a
 * momentary distraction doesn't cost the whole alert; (c) unlocks on more gesture
 * kinds and re-resumes when the tab regains focus. NOTE: audio can only ever reach a
 * user looking at (or at least keeping visible) this tab — a BACKGROUNDED tab needs
 * the desktop-notification channel, which the OS sounds independently of this file.
 */

let ctx: AudioContext | null = null;
const MUTE_KEY = "mis:notif-muted";

function getCtx(): AudioContext | null {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return null;
    if (!ctx) ctx = new Ctx();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Attach one-shot listeners so the AudioContext is unlocked on first interaction,
 * and keep it alive across tab-visibility changes (some browsers re-suspend an idle
 * context). Covers pointer, touch, click and keyboard — a user who only ever taps a
 * touchscreen still unlocks it.
 */
export function primeNotificationSound(): () => void {
  const unlock = () => {
    const c = getCtx();
    if (c?.state === "suspended") void c.resume();
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") unlock();
  };
  const events: (keyof WindowEventMap)[] = [
    "pointerdown",
    "touchstart",
    "click",
    "keydown",
  ];
  // `once` handlers self-remove after the first gesture unlocks the context.
  for (const e of events) window.addEventListener(e, unlock, { once: true });
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    for (const e of events) window.removeEventListener(e, unlock);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

/** One two-note rising motif (A5 → D6), triangle for cut-through with a sine body. */
function scheduleMotif(c: AudioContext, base: number): void {
  const notes = [880, 1174.66]; // A5 → D6
  const PEAK = 0.3;
  notes.forEach((freq, i) => {
    const start = base + i * 0.12;
    const gain = c.createGain();
    gain.connect(c.destination);
    // Fast attack → short sustain hold → exponential release. The hold lifts RMS
    // loudness (what the ear judges) far more than bumping the peak alone.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(PEAK, start + 0.015);
    gain.gain.setValueAtTime(PEAK, start + 0.14);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);

    // Triangle fundamental (harmonics in the 2–4 kHz band the ear is most sensitive
    // to) + a quieter sine an octave up for a little sparkle.
    const tri = c.createOscillator();
    tri.type = "triangle";
    tri.frequency.value = freq;
    tri.connect(gain);
    tri.start(start);
    tri.stop(start + 0.45);

    const spark = c.createOscillator();
    const sparkGain = c.createGain();
    sparkGain.gain.value = 0.35;
    spark.type = "sine";
    spark.frequency.value = freq * 2;
    spark.connect(sparkGain).connect(gain);
    spark.start(start);
    spark.stop(start + 0.45);
  });
}

/**
 * Play a two-note rising chime, repeated once (~1.1s total). No-op if muted (unless
 * `force`) or audio unavailable. Awaits resume so a just-unlocked context actually
 * sounds instead of dropping the notes.
 */
export async function playNotificationChime(opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && isSoundMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      /* autoplay still blocked — nothing we can do without a gesture */
    }
  }
  if (c.state !== "running") return; // never scheduled into a frozen clock again
  const now = c.currentTime;
  scheduleMotif(c, now);
  scheduleMotif(c, now + 0.55); // double-tap: a second chance to be noticed
}

/**
 * Explicit "Test sound" — plays even when muted (the user asked to hear it), and the
 * click itself is the gesture that unlocks the AudioContext for all later chimes.
 */
export function testNotificationChime(): void {
  const c = getCtx();
  if (c?.state === "suspended") void c.resume();
  void playNotificationChime({ force: true });
}

export function isSoundMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
}
