/**
 * HOW A LOOSE LETTER MOVES, AND HOW IT ANSWERS A POINTER.
 *
 * õ, ä, ö and ü are the four letters an English keyboard has no key for, which
 * is the single most concrete thing about learning to write Estonian, so they
 * are what this app decorates itself with. They were four squares doing one
 * three or four pixel wander on four periods of the same shape. That is a page
 * that is technically alive and reads as still: a reader has to watch one for
 * several seconds to notice it moved at all.
 *
 * A CHARACTER IS A RHYTHM, NOT A DISTANCE. How far a letter may travel is a
 * fact about the room the caller has, and the caller is the only one who knows
 * it: a letter tucked over the case card has about four pixels before it lands
 * on a word, and one loose in the hero has forty. So a character here supplies
 * the shape of the movement, the period, the rock and the squash, and every
 * caller hands in its own travel. Four characters rather than one, because the
 * argument against four squares rising together on one bob is the same
 * argument against four squares wandering together on one keyframe.
 *
 * THE TRAVEL IS ALONG THE EDGE, WHICH IS WHERE THE ROOM IS. A letter tucked
 * over the top of a card has a card underneath it and a heading above it, so
 * it has almost nothing vertically and the whole width of the card sideways.
 * `freeAxis` is that fact, and it is what lets these move far enough to be
 * worth watching: sliding thirty pixels along an edge is visible from across a
 * room and costs the placement nothing, where three pixels toward the card is
 * invisible and spends the whole budget.
 *
 * NOTHING HERE READS THE DOM. It is arithmetic on numbers a component
 * measured, so the reach and the lean can be reasoned about in a test rather
 * than in a browser. `components/LetterTile.tsx` does the measuring.
 */

/** Which side of something a letter is tucked over. */
export type LetterEdge = "top" | "bottom" | "left" | "right";

/**
 * A way of moving. Every one of these is declared as keyframes in
 * `app/globals.css` and reads the same four custom properties, so a caller
 * changing character never has to change its budget.
 */
export interface LetterCharacter {
  /** What a screen asks for. */
  readonly name: string;
  /** The keyframes in `app/globals.css` that carry it. */
  readonly keyframes: string;
  /** One cycle, in seconds. No two of these share a period, so four letters
   *  on four characters fall back into step about once an hour. */
  readonly time: number;
  /** How far it rocks either side of its resting slant, in degrees. */
  readonly turn: number;
  /** How much it swells and squashes. A letter that keeps its size is 0. */
  readonly pop: number;
  /** Its easing. A swing is a pendulum and a hop is not. */
  readonly ease: string;
  /**
   * What it turns about. A pendulum hangs from somewhere near its top and
   * everything else turns about its middle, which is the difference between a
   * swing and a wobble.
   */
  readonly origin: string;
}

/**
 * The four, in the order the landing page hands them out.
 *
 * They differ in what carries the movement, which is the only way four things
 * moving at once read as four things rather than as a mechanism. The wanderer
 * ambles and returns by another route, the hopper crouches and springs and
 * lands heavily, the swinger is a pendulum that barely goes anywhere, and the
 * tumbler rolls: most of its budget is spent on the rotation.
 *
 * THE PERIODS ARE SHORT ENOUGH TO CATCH. The first table had the wanderer on
 * 5.5 seconds and the tumbler on 6.7, over a travel of 26 to 30 pixels, and
 * the page was measured moving and reported as still: a square covering a
 * hand's width in six seconds is a square nobody sees move unless they are
 * already watching it. Every period came down by a fifth and every rock and
 * squash went up by about a third, so a glance catches one mid-hop. The
 * periods still share no common measure, which is what keeps four letters
 * from falling into step.
 */
export const LETTER_CHARACTERS: readonly LetterCharacter[] = [
  { name: "wander", keyframes: "letter-wander", time: 4.6, turn: 9, pop: 0.07, ease: "ease-in-out", origin: "50% 50%" },
  { name: "hop", keyframes: "letter-hop", time: 2.9, turn: 8, pop: 0.16, ease: "cubic-bezier(0.34, 1.56, 0.64, 1)", origin: "50% 80%" },
  { name: "swing", keyframes: "letter-swing", time: 3.7, turn: 14, pop: 0.05, ease: "cubic-bezier(0.37, 0, 0.63, 1)", origin: "50% 12%" },
  { name: "tumble", keyframes: "letter-tumble", time: 5.3, turn: 18, pop: 0.09, ease: "cubic-bezier(0.45, 0.05, 0.55, 0.95)", origin: "50% 50%" },
];

/** One character by name, or the wanderer, which is the quietest of the four. */
export function letterCharacter(name: string): LetterCharacter {
  return LETTER_CHARACTERS.find((c) => c.name === name) ?? LETTER_CHARACTERS[0]!;
}

/**
 * The axis a letter tucked over an edge is free to travel on.
 *
 * Along the edge, always. The other axis is the one with a card on one side
 * and a page on the other, and it is the one `scripts/test-design.mjs`
 * measures twelve times a cycle.
 */
export function freeAxis(edge: LetterEdge): "x" | "y" {
  return edge === "top" || edge === "bottom" ? "x" : "y";
}

/**
 * Which way is onto the card, as a unit vector.
 *
 * A letter hanging off the left drifts right, one hanging off the bottom
 * drifts up. Outward is where the edge of the window is.
 */
export function inward(edge: LetterEdge): { x: number; y: number } {
  switch (edge) {
    case "top": return { x: 0, y: 1 };
    case "bottom": return { x: 0, y: -1 };
    case "left": return { x: 1, y: 0 };
    case "right": return { x: -1, y: 0 };
  }
}

export interface LetterPlacement {
  /** Which character it moves with. */
  readonly character: LetterCharacter;
  /** The edge it is tucked over. It decides which way the second leg of the
   *  wander is allowed to go. */
  readonly edge: LetterEdge;
  /** Its resting slant, in degrees. Declared rather than animated, so a reader
   *  who asked for less motion still gets a set of tilted squares. */
  readonly tilt: number;
  /** How far it may travel, in pixels, per axis. The caller's room. */
  readonly travel: { readonly x: number; readonly y: number };
  /** Scales the character's rock and squash where a placement is tight.
   *  1 is the character as written. */
  readonly room?: number;
  /** Seconds of head start, so a set does not begin together. */
  readonly delay?: number;
}

/**
 * The custom properties one letter carries.
 *
 * Written as a plain record rather than a style object so the caller decides
 * whether it is a `style` prop or a `setProperty`, and so this module stays
 * clear of React.
 */
export function letterVars(p: LetterPlacement): Record<string, string> {
  const room = p.room ?? 1;
  const back = returnLeg(p);
  return {
    "--float-tilt": `${p.tilt}deg`,
    "--drift-name": p.character.keyframes,
    "--drift-time": `${p.character.time}s`,
    "--drift-ease": p.character.ease,
    "--drift-origin": p.character.origin,
    "--drift-turn": `${round(p.character.turn * room)}deg`,
    "--drift-pop": `${round(p.character.pop * room)}`,
    "--drift-x": `${round(p.travel.x)}px`,
    "--drift-y": `${round(p.travel.y)}px`,
    "--drift-x2": `${round(back.x)}px`,
    "--drift-y2": `${round(back.y)}px`,
    "--drift-delay": `${p.delay ?? 0}s`,
  };
}

/**
 * The second leg, which is what stops a wander looking like it is on rails.
 *
 * A letter that goes out and comes straight back is a metronome, so every
 * character here has a stop somewhere else on the way home. Where that stop
 * may be is the whole of the geometry: along its own edge a letter has room
 * both ways, so the return leg overshoots the other side of where it started,
 * and on the axis pointing at the card it has room in one direction only, so
 * the return leg is a shorter version of the outward one. A letter loose on a
 * page has room both ways on both axes.
 *
 * This is why the keyframes never multiply a travel by a negative number
 * themselves: keyframes cannot know which edge a letter is on, and a wander
 * written to reverse on x is a letter walking off the page the day somebody
 * moves it to the left edge.
 */
export function returnLeg(p: LetterPlacement): { x: number; y: number } {
  const free = freeAxis(p.edge);
  return {
    x: free === "x" ? -p.travel.x * 0.55 : p.travel.x * 0.4,
    y: free === "y" ? -p.travel.y * 0.55 : p.travel.y * 0.4,
  };
}

/** Two decimal places, and no trailing zeroes, because these end up in markup. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface Lean {
  /** Pixels, on top of whatever the animation is doing. */
  readonly x: number;
  readonly y: number;
  /** Degrees, in the direction of travel, so it tips the way it slides. */
  readonly turn: number;
}

export const NO_LEAN: Lean = { x: 0, y: 0, turn: 0 };

/**
 * How a letter answers a pointer that has come near it.
 *
 * The rule is the same one the travel follows and for the same reason: it
 * slides along its own edge toward the pointer, and the only thing it ever
 * does on the other axis is move further onto the card. A letter that leant
 * away from a pointer would leave the card at exactly the moment somebody was
 * looking at it, and one that leant toward a pointer on both axes would hang
 * off the edge of the page on the letters that have no gutter left.
 *
 * Nearness is squared on purpose. Linear falloff means every letter within
 * half a screen is visibly displaced all the time, which reads as a page that
 * has been knocked askew. Squared, a letter is at rest until the pointer is
 * genuinely near it, and then it moves quickly.
 */
export function leanFor(opts: {
  edge: LetterEdge;
  pointer: { x: number; y: number };
  centre: { x: number; y: number };
  /** How near the pointer has to be before anything happens. */
  reach: number;
  /** How far it goes at the closest. */
  pull: number;
}): Lean {
  const dx = opts.pointer.x - opts.centre.x;
  const dy = opts.pointer.y - opts.centre.y;
  const distance = Math.hypot(dx, dy);
  if (!(distance < opts.reach) || opts.reach <= 0) return NO_LEAN;

  const near = (1 - distance / opts.reach) ** 2;
  const cap = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));

  const along = freeAxis(opts.edge) === "x" ? dx : dy;
  const slide = cap(along * near * 0.6, opts.pull);
  const push = inward(opts.edge);
  // Half the travel, inward only, so the closer the pointer gets the more
  // firmly the letter is on the card rather than off the page.
  const settle = near * opts.pull * 0.5;
  const turn = round(cap((slide / opts.pull) * 9, 9));

  return freeAxis(opts.edge) === "x"
    ? { x: round(slide + push.x * settle), y: round(push.y * settle), turn }
    : { x: round(push.x * settle), y: round(slide + push.y * settle), turn };
}

/**
 * THE ONE THING ALL FOUR DO TOGETHER, AND ONLY WHEN SOMETHING HAPPENS.
 *
 * The characters above are what keeps the letters from moving as a set, and
 * a set moving together is exactly right for one moment: the word under them
 * changing. The case explorer says so on `document`, every tile hears it, and
 * each hops once, a beat after the one before it, which is the ornament
 * noticing the card it is tucked over rather than looping beside it. It is a
 * scale and a rotation and never a translation, because a keyframe cannot
 * know which edge a letter hangs off (see `returnLeg`), and a hop that went
 * "up" would carry the letter on the bottom edge onto the card and the one
 * on the top edge off the page.
 *
 * The event's name lives here rather than in either component, so the side
 * that fires it and the side that hears it read one string.
 */
export const LETTER_CHEER_EVENT = "kodukeel:word-changed";

/** The keyframes in `app/globals.css` that carry the hop, and how long. */
export const LETTER_CHEER = { keyframes: "letter-cheer", time: 0.62 } as const;

/**
 * When a letter joins the cheer, in seconds, from its own head start.
 *
 * The four are handed out with head starts of about three quarters of a
 * second apart, so the same ordering scaled down is a stagger of about ninety
 * milliseconds: the letters hop in the order they were placed, round the card,
 * and the last has started before the first has landed.
 */
export function cheerDelay(headStart: number): number {
  return round(Math.max(0, headStart) * 0.12);
}
