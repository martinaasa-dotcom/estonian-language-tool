/**
 * Two short sounds: one for a right answer, one for a wrong one.
 *
 * Made with the browser's own oscillator rather than fetched, so they cost no
 * request, work with the network off, and add nothing to the bundle. The
 * right one is two notes going up, the wrong one is a single low note, which
 * is the contrast every game console settled on because it reads without
 * anybody having to learn it. Both are quiet, short, and shaped with an
 * envelope so they do not click.
 *
 * Browser only. A page that has never been touched cannot start an
 * AudioContext, and this asks for one lazily on the first sound, which by
 * then is after the click or keypress that produced the answer.
 */
let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return context;
}

function tone(ctx: AudioContext, at: number, hz: number, ms: number, gain: number, type: OscillatorType) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, at);
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + ms / 1000 + 0.02);
}

export type Feedback = "right" | "wrong";

/** Plays one of the two sounds. Safe to call anywhere; a no-op outside a browser. */
export function playFeedback(kind: Feedback): void {
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === "right") {
    tone(ctx, now, 659.25, 110, 0.12, "sine");        // E5
    tone(ctx, now + 0.09, 880, 160, 0.12, "sine");    // A5
  } else {
    tone(ctx, now, 196, 180, 0.10, "triangle");       // G3
  }
}
