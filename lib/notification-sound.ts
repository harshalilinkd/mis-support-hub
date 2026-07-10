/**
 * A gentle notification chime synthesized with the Web Audio API — no audio
 * asset to ship or host. One shared AudioContext, primed on the first user
 * gesture so later chimes aren't blocked by the browser's autoplay policy.
 * Client-only: every function touches `window`, so call these from effects/handlers.
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

/** Attach one-shot listeners so the AudioContext is unlocked on first interaction. */
export function primeNotificationSound(): () => void {
  const unlock = () => {
    const c = getCtx();
    if (c?.state === "suspended") void c.resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
}

/** Play a soft two-note rising chime (~0.4s). No-op if muted or audio unavailable. */
export function playNotificationChime(): void {
  if (isSoundMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();

  const now = c.currentTime;
  const notes = [880, 1174.66]; // A5 → D6
  notes.forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = now + i * 0.11;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.13, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.32);
  });
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
