/**
 * Which drill addresses the thing a conversation went wrong on.
 *
 * The debrief ends with one thing to work on, and it linked `/review/write`
 * whatever had happened, which is a link that is right about a third of the
 * time and reads as furniture the rest of it. The app knows more than that
 * without inventing anything: a beat says what it needed, and `Requirement`
 * has a `kind`, so the drill is read off the failure rather than written by the
 * screen. `assessReadiness` makes the same move on the exam hub and for the
 * same reason: the app knows what it can drill and does not know what to say.
 *
 * Deliberately small, and it maps a *kind* rather than a beat. A table keyed on
 * beat ids would be one entry per beat per scene, which is a second catalog
 * that goes stale the first time a scene is edited.
 *
 * `datum`, `question`, `negation`, `register` and `any` are all things a
 * learner did or did not do rather than a word they hold a card for, and no
 * drill in the app rehearses them, so those return nothing and the debrief
 * prints no link. A missing link is honest; a link to the wrong drill is a
 * screen saying "go and practice this" about something else.
 *
 * Pure: no React, no Next, no Prisma. `lib/ux/modes.ts` is what a mode *is*,
 * and an invariant checks every href here is one of them, because a drill that
 * was retired leaves a dead link on a screen somebody reached by failing.
 */
import { leafNeeds, type Requirement } from "./types";

export function drillFor(needs: readonly Requirement[]): string | null {
  const leaves = leafNeeds(needs).map((leaf) => leaf.need);
  for (const need of leaves) {
    /*
      A case first, because it is the specific one: `/review/write` asks for a
      word in a named case, checks it against the dictionary before any model
      sees it, and is exactly the thing a beat with a `case` requirement asked
      for and did not get.
    */
    if (need.kind === "case") return "/review/write";
  }
  for (const need of leaves) {
    /*
      A word they could not find. The words themselves are already above with a
      button to keep them, so this is the round for words you have met and not
      held on to rather than a way to add more.
    */
    if (need.kind === "lemma") return "/review/flashcards";
  }
  return null;
}
