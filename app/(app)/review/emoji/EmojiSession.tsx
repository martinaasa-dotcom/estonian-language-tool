"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Timer, Trophy } from "lucide-react";
import { ButtonLink, Button } from "@/components/Button";
import { Chip, Page, StatTile } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { useFeedbackSound } from "@/components/AudioPrefs";
import { shuffle } from "@/lib/random/shuffle";
import { gradeCard } from "@/app/actions";

export interface EmojiPair {
  id: string;
  /**
   * The card this pair is evidence about, when the word is in the learner's
   * deck. Null for a word drawn from the dictionary to fill the board, and
   * nothing is graded for those: there is no card, so a row about one would be
   * a row about something that does not exist.
   */
  cardId: string | null;
  emoji: string;
  lemma: string;
  /** The case form the tile shows. */
  form: string;
  /** The question the case answers, which is how a class names it. */
  question: string | null;
  caseEt: string | null;
}

type Side = "picture" | "word";
interface Tile { key: string; pairId: string; side: Side }

/**
 * PICTURE MATCH.
 *
 * Two columns of tiles, six pairs, against a clock. Tap a picture and then the
 * Estonian that belongs to it. A right pair leaves the board; a wrong one shakes
 * and stays.
 *
 * WHY THERE IS NO ENGLISH ON THE SCREEN. The emoji is the meaning, so the word
 * side is free to be a case form with the question it answers over it: `kus?`
 * over `majas`. That is the whole reason this round is not a vocabulary round.
 * A learner reading `kus? majas` beside 🏠 has confirmed the word and the ending
 * in one move.
 *
 * IT GRADES WHAT IT CAN. Every mode writes to the review log (ADR-016) so the
 * scheduler sees what was actually practised, and this one does too: a pair
 * drawn from the learner's own deck is graded on the match. Found first time is
 * a recognition and grades Good; found after a wrong try grades Hard, which is
 * what a near miss is graded everywhere else in this app.
 *
 * A pair drawn from the dictionary to fill the board carries no card and is not
 * graded, because there is nothing to grade: only 313 nouns have a picture, so
 * a beginner's deck cannot fill six pairs on its own. That is a gap in the
 * board rather than an exemption from the rule.
 */
export function EmojiSession({ pairs: initialPairs }: { pairs: EmojiPair[] }) {
  // Snapshotted once on mount, like every session here: a Server Action
  // refreshing this route must not swap the board mid-round.
  const [pairs] = useState(initialPairs);
  // Laid out once on mount: a board that re-shuffled under a tap would be a
  // different game. `layOut` is called in the initialiser rather than on every
  // render for the same reason.
  const [tiles] = useState<Tile[]>(() => layOut(initialPairs));
  const [picked, setPicked] = useState<Tile | null>(null);
  const [matched, setMatched] = useState<ReadonlySet<string>>(() => new Set());
  const [wrong, setWrong] = useState<string | null>(null);
  const [misses, setMisses] = useState(0);
  /** Pairs a wrong try has already touched, so a match after one grades Hard. */
  const missedPairs = useRef<Set<string>>(new Set());
  const [phase, setPhase] = useState<"ready" | "running" | "done">("ready");
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const sound = useFeedbackSound();

  useEffect(() => {
    if (phase !== "running") return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === "running" && matched.size === pairs.length) setPhase("done");
  }, [phase, matched, pairs.length]);

  const pick = useCallback((tile: Tile) => {
    if (phase !== "running" || matched.has(tile.pairId)) return;

    if (!picked) { setPicked(tile); return; }
    if (picked.key === tile.key) { setPicked(null); return; }

    // Two tiles of the same side is not an answer, it is changing your mind.
    if (picked.side === tile.side) { setPicked(tile); return; }

    if (picked.pairId === tile.pairId) {
      sound("right");
      setMatched((m) => new Set(m).add(tile.pairId));
      setPicked(null);
      const pair = pairs.find((p) => p.id === tile.pairId);
      if (pair?.cardId) {
        // Good first time, Hard after a wrong try: the same two ratings a near
        // miss and a clean hit get everywhere else. Not awaited, because a
        // matching board should never wait on a round trip between taps.
        void gradeCard(pair.cardId, missedPairs.current.has(pair.id) ? 2 : 3, 0);
      }
      return;
    }

    sound("wrong");
    setMisses((n) => n + 1);
    missedPairs.current.add(picked.pairId);
    missedPairs.current.add(tile.pairId);
    setWrong(tile.key);
    setPicked(null);
    window.setTimeout(() => setWrong(null), 420);
  }, [phase, picked, matched, pairs, sound]);

  if (phase === "ready") {
    return (
      <Page title="Picture match" lead="Match the picture to the Estonian, ending and all.">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
          <p className="text-5xl" aria-hidden>🏠 🐕 🍎</p>
          <p className="max-w-[42ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            No English on the board. The picture is the meaning, so the Estonian
            side can be a case form: match <span lang="et" className="font-semibold">majas</span>{" "}
            to the house, not <span lang="et" className="font-semibold">maja</span>.
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => { startedAt.current = Date.now(); setPhase("running"); }}
          >
            Start
          </Button>
          <ButtonLink href="/practice">Back to practice</ButtonLink>
        </div>
      </Page>
    );
  }

  if (phase === "done") {
    return (
      <Page title="Picture match" lead="Every pair found.">
        <div className="mx-auto flex max-w-md flex-col items-center gap-5 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full quest-pop"
            style={{ background: "var(--mint-soft)", color: "var(--mint-ink)" }}>
            <Trophy size={34} aria-hidden />
          </span>
          <div className="grid w-full grid-cols-2 gap-3">
            <StatTile value={`${elapsed}s`} label="Time" tone="sky" />
            <StatTile value={misses} label="Wrong tries" tone={misses === 0 ? "mint" : "butter"} />
          </div>

          {/* What the round was actually about, read back. A board with no
              English on it is only worth it if the learner can check what they
              matched afterwards. */}
          <ul className="w-full text-left">
            {pairs.map((p) => (
              <li key={p.id} className="flex items-center gap-3 border-b py-2 last:border-0"
                style={{ borderColor: "var(--rule-soft)" }}>
                <span className="text-2xl" aria-hidden>{p.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span lang="et" className="font-semibold" style={{ color: "var(--ink)" }}>{p.form}</span>
                  <span className="text-sm" style={{ color: "var(--ink-3)" }}>
                    {" "}from <span lang="et">{p.lemma}</span>
                    {p.caseEt && <>, <span lang="et">{p.caseEt}</span></>}
                  </span>
                </span>
                <Speak text={p.form} />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap justify-center gap-3">
            <ButtonLink href="/review/emoji" variant="primary" size="lg">Another board</ButtonLink>
            <ButtonLink href="/practice" size="lg">Back to practice</ButtonLink>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <h1 className="sr-only">Picture match</h1>

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold tabular-nums" style={{ color: "var(--ink-2)" }}>
          <Timer size={15} aria-hidden /> {elapsed}s
        </span>
        <Chip tone={matched.size === pairs.length ? "good" : "hard"}>
          {matched.size} of {pairs.length}
        </Chip>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {tiles.map((tile) => {
          const pair = pairs.find((p) => p.id === tile.pairId)!;
          const gone = matched.has(tile.pairId);
          const chosen = picked?.key === tile.key;

          return (
            <button
              key={tile.key}
              type="button"
              disabled={gone}
              onClick={() => pick(tile)}
              /*
                No label on the picture tile, deliberately. It carried
                `Picture 3`, which is the board's own ordering and tells a
                screen reader nothing: the game became unplayable without
                sight. Left unlabelled, the emoji character inside is what gets
                announced, and assistive technology reads it by its Unicode
                name, so the tile says "bread" and the round can be played by
                matching that against `leivalt`.

                That name is English, on a board whose whole argument is that
                there is none. It is the right trade: the English is heard only
                by somebody for whom the picture is nothing at all.
              */
              aria-label={tile.side === "word" ? pair.form : undefined}
              className={`choice-btn flex min-h-[5.5rem] flex-col items-center justify-center gap-1 rounded-[var(--r-lg)] p-3 ${
                wrong === tile.key ? "emoji-shake" : ""}`}
              style={{
                opacity: gone ? 0 : 1,
                pointerEvents: gone ? "none" : undefined,
                transition: "opacity 220ms ease",
                ...(chosen
                  ? { ["--choice-bg" as string]: "var(--accent-soft)", color: "var(--accent-deep)" }
                  : {}),
              }}
            >
              {tile.side === "picture" ? (
                <span className="text-4xl leading-none">{pair.emoji}</span>
              ) : (
                <>
                  {pair.question && (
                    <span lang="et" className="label-xs" style={{ color: "var(--ink-3)" }}>
                      {pair.question}
                    </span>
                  )}
                  <span lang="et" className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
                    {pair.form}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The board: pictures down one column, words down the other, each shuffled on
 * its own.
 *
 * Two columns rather than one pool, because a picture can only ever pair with a
 * word: mixing them would let a learner tap two pictures and wait to be told
 * that is not a move. Shuffled separately so the row a tile sits in says
 * nothing about its partner.
 */
function layOut(pairs: EmojiPair[]): Tile[] {
  const pictures = shuffle(pairs).map((p) => ({ key: `p-${p.id}`, pairId: p.id, side: "picture" as const }));
  const words = shuffle(pairs).map((p) => ({ key: `w-${p.id}`, pairId: p.id, side: "word" as const }));
  // Interleaved so the two columns of the grid are one of each.
  return pictures.flatMap((pic, i) => [pic, words[i]!]);
}
