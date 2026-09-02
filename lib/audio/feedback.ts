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

/**
 * A RUN OF RIGHT ANSWERS CLIMBS, AND THEN IT STOPS CLIMBING.
 *
 * The two-note chime is the same every time, so the tenth card in a row you
 * got right sounds exactly like the first, and a review session has no shape
 * to it at all. A run that goes up says what a counter on the screen would
 * say and says it while you are reading the next card, which is the one thing
 * sound is better at than a number.
 *
 * A minor pentatonic on A, because it is the scale with no interval in it that
 * can sound wrong against another: any two of these notes played in any order
 * are consonant, so a run interrupted and restarted never lands on a sour
 * pair. Six steps and then it holds at the top rather than climbing out of
 * hearing, which is also the honest shape: past six in a row the news is "you
 * are on a run", not "you are on a longer run than a moment ago".
 *
 * The wrong sound does not descend to match. A miss is the moment worth
 * stopping at and a scale falling away from it would be the app being
 * disappointed, which is not the voice this project writes in.
 */
const CLIMB = [
  659.25,   // E5
  783.99,   // G5
  880.0,    // A5
  1046.5,   // C6
  1174.66,  // D6
  1318.51,  // E6
] as const;

/**
 * Plays one of the two sounds.
 *
 * `streak` is how many in a row have been right, counting this one, and is
 * optional: a caller that is not counting gets the sound the app has always
 * made. Safe to call anywhere; a no-op outside a browser.
 */
export function playFeedback(kind: Feedback, streak = 1): void {
  const ctx = audioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === "right") {
    const step = Math.min(Math.max(1, Math.round(streak)), CLIMB.length) - 1;
    const first = CLIMB[step]!;
    const second = CLIMB[Math.min(step + 2, CLIMB.length - 1)]!;
    tone(ctx, now, first, 110, 0.12, "sine");
    tone(ctx, now + 0.09, second, 160, 0.12, "sine");
  } else {
    tone(ctx, now, 196, 180, 0.10, "triangle");       // G3
  }
}
