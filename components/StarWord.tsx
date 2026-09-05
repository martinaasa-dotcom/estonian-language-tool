"use client";

import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toggleStar } from "@/app/actions";

/**
 * FAVOURITE THIS WORD, WHEREVER THE WORD IS.
 *
 * Asked for directly: a star in the corner of every card that puts a word or a
 * phrase in front of somebody to learn, so the one they want to come back to
 * can be kept in the moment they notice it rather than remembered until they
 * next open the dictionary. Starring already existed and lived on exactly one
 * screen, the dictionary entry, which is the screen a learner is least often
 * on: the words they care about are met on a review card.
 *
 * ONE DRAWING, FOR THE REASON `WeakestCases` IS ONE COMPONENT. A star copied
 * into four sessions is four answers to what a favourite looks like and what
 * it does when the toggle fails, and the copy nobody is looking at is the one
 * that stops saying which state it is in.
 *
 * THE ACCENT, WHICH IS THE HUE THAT MEANS "THIS IS YOURS"
 * (`docs/14-design-system.md` §1). The dictionary's own star was butter, which
 * that table gives to "nearly, timed, a warning that isn't a failure", and on
 * a review card butter is what a near miss is painted: a bookmark wearing the
 * grading scale's colour on the screen that grades is a hue making a claim it
 * does not mean.
 *
 * AND THE HUE IS NOT THE ONLY THING SAYING WHICH STATE IT IS IN. The star is
 * filled when it is on and outlined when it is not, it carries `aria-pressed`,
 * and its label says what pressing it will do.
 *
 * NOT QUEUED WHEN THE NETWORK IS GONE. A grade is an answer and goes into the
 * outbox because losing one loses evidence (ADR-015); a star is a bookmark,
 * and the honest thing to do with one that did not land is to put the button
 * back the way it was rather than to promise it later.
 */
export function StarWord({
  lexemeId, starred, label,
}: {
  lexemeId: string;
  starred: boolean;
  /** The word, so the label says which one is being kept. */
  label: string;
}) {
  /*
    THE STATE IS RESET BY THE WORD, NOT BY A KEY AT THE CALL SITE.

    Every screen this sits on shows one word after another out of one queue,
    and React keeps a component's state while its position in the tree holds
    still: without this, starring a word and pressing Next left the next word
    drawn as a favourite it is not. A `key` at each call site fixes it and is
    the thing a fifth caller forgets, which is the argument this repository
    makes about every rule it moved out of a caller. This is React's own
    pattern for a state that a prop supersedes, and it re-renders immediately
    rather than after a paint, so nothing is ever drawn in the stale state.
  */
  const [shown, setShown] = useState({ lexemeId, starred });
  if (shown.lexemeId !== lexemeId) setShown({ lexemeId, starred });
  const on = shown.starred;
  const setOn = (next: boolean) => setShown({ lexemeId, starred: next });
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `Remove ${label} from your favourites` : `Add ${label} to your favourites`}
      disabled={pending}
      className="tap-tint flex h-9 w-9 items-center justify-center rounded-full"
      style={{ color: on ? "var(--accent-deep)" : "var(--ink-3)" }}
      onClick={() => {
        // Optimistic, because the point of a star in a corner is that it costs
        // nothing to press mid-card. Put back where it was if it did not land.
        const next = !on;
        setOn(next);
        start(async () => {
          const result = await toggleStar(lexemeId).catch(() => null);
          setOn(result?.ok ? result.starred : !next);
        });
      }}
    >
      <Star size={17} aria-hidden fill={on ? "currentColor" : "none"} />
    </button>
  );
}
