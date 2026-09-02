/**
 * What sits next to what in a session.
 *
 * FSRS decides *when* a card comes back and this decides nothing about that.
 * What it decides is the order of the cards that are already due, which the
 * scheduler has no opinion on and which changes what a review measures.
 *
 * A WORD'S CARDS ARRIVE TOGETHER AND COME BACK TOGETHER. `addCardsFor` writes
 * every card of a word in one `createMany`, so they share a `createdAt`; they
 * are then graded in the same session and come back with almost the same
 * `due`, and the queue is `orderBy: { due: "asc" }`. Measured on the demo
 * deck: of 32 due cards, 13 adjacent pairs were two cards of one word, 17 of
 * the 32 had a sibling within three positions, and seven case cards of
 * `Eesti` ran in a row.
 *
 * That is not a tidiness complaint. Answering `tuba → milles? kus?` twenty
 * seconds after answering `tuba → millesse? kuhu?` is reading the answer off
 * the card before rather than retrieving it, and the log records a recall
 * either way: the scheduler then raises the interval on a memory that was
 * never tested. The retrieval-effort account (Pyc and Rawson) is that the
 * benefit of a recall scales with how hard it was, so a cued one earns a
 * re-read's retention while being priced as a recall.
 *
 * Nothing is dropped and nothing is brought forward past a card that is not
 * due: a card is only ever moved later, and only past cards of other words.
 * If the queue cannot give a word its gap, the card stays where it was, which
 * is what happens in a session of six cards about three words.
 */

/** The least a session will try to put between two cards of one word. */
export const SIBLING_GAP = 6;

/**
 * Re-orders a due list so cards of one word are not adjacent.
 *
 * A stable pass: walk the queue in its given order, and where the next card
 * shares a word with one of the last `gap` cards taken, look ahead for the
 * first card that does not and take that instead. The deferred card is not
 * removed, it is simply reached later, so the set is exactly the set that
 * came in.
 */
export function spaceSiblings<T>(
  cards: readonly T[],
  keyOf: (card: T) => string | null,
  gap = SIBLING_GAP,
): T[] {
  const remaining = [...cards];
  const out: T[] = [];
  const recent: (string | null)[] = [];

  while (remaining.length > 0) {
    /*
      The widest gap this queue can still afford, narrowing to none.

      Asking only for the full gap and giving up otherwise makes the tail of a
      session bunch: seven case cards of one word among twenty-five others
      would take the full gap four times and then run the last three
      together, because the arithmetic ran out (seven cards six apart needs
      thirty-six others). Narrowing means the session degrades to five apart,
      then four, and only ever puts two cards of a word side by side when
      every card left belongs to a word already on screen.
    */
    let index = -1;
    for (let window = Math.min(gap, recent.length); window >= 1 && index === -1; window--) {
      const recentWindow = recent.slice(recent.length - window);
      index = remaining.findIndex((card) => {
        const key = keyOf(card);
        return key === null || !recentWindow.includes(key);
      });
    }
    // Nothing left belongs to another word: take the one waiting longest.
    if (index === -1) index = 0;

    const [taken] = remaining.splice(index, 1);
    out.push(taken!);
    recent.push(keyOf(taken!));
    if (recent.length > gap) recent.shift();
  }

  return out;
}

/**
 * Puts a card back into the session a few places on.
 *
 * Shared by the Again path, which has always done this, and by a newly met
 * word, which now gets asked back before the session ends. Five to eight
 * places is far enough that the answer is not still on screen and near enough
 * that a short session still reaches it; where the queue is shorter than
 * that, the card goes last, which is the best a short session can do.
 */
export const REQUEUE_GAP = 5;

export function requeue<T>(queue: readonly T[], card: T, from: number, gap = REQUEUE_GAP): T[] {
  const next = [...queue];
  const at = Math.min(next.length, from + gap);
  next.splice(at, 0, card);
  return next;
}
