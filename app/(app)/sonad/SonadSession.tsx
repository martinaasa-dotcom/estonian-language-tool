"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Delete } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Button } from "@/components/Button";
import { Card, Chip } from "@/components/ui";
import {
  cluesAt, letterMarks, nextClue, outcomeOf, scoreGuess, solvedAt,
  SONAD_GUESSES, SONAD_KEY_ROWS, SONAD_KEYS, SONAD_LENGTH, vowelCount, wellFormed,
  type Mark,
} from "@/lib/games/sonad";
import type { Puzzle } from "@/lib/progress/sonad";
import { addToDeck, recordSonad } from "@/app/actions";
import { loadBoard, saveBoard } from "./resume";

/**
 * SÕNAD'S BOARD.
 *
 * Circles rather than squares, the app's own three hues rather than green,
 * yellow and grey, and its own movements. `lib/games/sonad.ts` says what is
 * owned by whom and why none of that is an accident.
 *
 * THE ANSWER IS IN THE BROWSER AND THE SCORE IS NOT. Marking a guess without a
 * round trip is most of how this feels to play, so the word crosses; what a
 * finished round is worth is decided on the server from the guesses, so a
 * forged board cannot post a Good for a word nobody answered. See
 * `lib/progress/sonad.ts`.
 *
 * THE KEYS ARE AN ESTONIAN KEYBOARD, WHICH IS NOT THE ESTONIAN ALPHABET, and
 * which of those it is lives in `lib/games/sonad.ts` beside the rule about
 * which letters a guess may hold: a keyboard missing one of them looks exactly
 * like a keyboard, so the pairing is tested rather than remembered. What is
 * decided here is only how wide a key is drawn, which is a fact about a phone.
 *
 * It doubles as the record of what each letter turned out to be, which is why
 * it is on the page at all rather than leaving a phone to its own keyboard.
 */

/**
 * WHAT EACH OF THE THREE LOOKS LIKE, AND WHY COLOUR IS NOT ALL OF IT.
 *
 * The design system's rule is that a colour may never be the only thing
 * carrying a distinction, and this board is the exact case it is written for.
 * The first version was mint, butter's tint and `--raised`, which in the light
 * theme is a strong green beside two pale washes: the two that matter most to
 * tell apart, "in the word somewhere" and "not in the word at all", differed by
 * hue alone. That is unreadable to about one man in twelve and hard for anybody
 * on a phone in daylight.
 *
 * So the three are three different *kinds of object* and the hue is the second
 * signal rather than the only one.
 *
 *   here       a solid fill and no ring. The letter is settled.
 *   elsewhere  a tint with a ring round it. In play, and not placed.
 *   absent     a flat wash, no ring, a muted letter. Spent.
 *
 * The ring is the part that is not colour, and it is what tells `elsewhere`
 * from `absent` for somebody who cannot see the difference between a pale
 * cream and a pale lavender. Its first draft dropped the fill as well, on the
 * argument that an outline says "in play" better than a wash does, and that
 * measured 3.52:1 in the light theme: `--butter-ink` is drawn to sit on
 * butter's tint and not on the card. Measured in a browser rather than reasoned
 * about from the token list, in both themes, which is the rule.
 *
 * A HUE HAS A FILL AND AN INK AND THEY ARE NOT INTERCHANGEABLE. `--on-mint` is
 * the ink for mint's *solid* fill, which is the one the palette has and the one
 * the week strip's tick needed. `--butter-ink` is the ink for butter and is
 * what the ring and the letter inside it are drawn in, on the ordinary card
 * ground, which is a pairing the palette already defines. Inventing an
 * `--on-butter` from inside a game to make the three look symmetrical would be
 * adding a token to a design system sideways.
 */
const HUE: Record<Mark, { bg: string; ink: string; ring: string }> = {
  here: { bg: "var(--mint)", ink: "var(--on-mint)", ring: "transparent" },
  elsewhere: { bg: "var(--butter-soft)", ink: "var(--butter-ink)", ring: "var(--butter-ink)" },
  absent: { bg: "var(--raised)", ink: "var(--ink-3)", ring: "transparent" },
};

/** How thick each ring is, which is the half of the signal that is not colour. */
const RING: Record<Mark, string> = { here: "0", elsewhere: "3px", absent: "0" };

/**
 * And the third channel, for a reader who gets neither the fill nor the ring.
 *
 * A fill and a ring are two signals and both of them are visual. Every circle
 * that has been marked says what it is in words, and the row announces its
 * tally once rather than reading 36 labels out on every guess, which is what
 * an `aria-live` on the whole board was doing.
 */
const SPOKEN: Record<Mark, string> = {
  here: "in place",
  elsewhere: "in the word, elsewhere",
  absent: "not in the word",
};

const EMPTY = { bg: "transparent", ink: "var(--ink)", ring: "var(--rule)" };

export function SonadSession({ puzzle, day, guessable }: {
  puzzle: Puzzle;
  day: string;
  /** Every Estonian word of this length, so a guess is checked without a call. */
  guessable: string[];
}) {
  const [guesses, setGuesses] = useState<string[]>([]);
  const [typed, setTyped] = useState("");
  const [refused, setRefused] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [kept, setKept] = useState(puzzle.inDeck);
  const recorded = useRef(false);
  /** In flight, so a re-render does not send the same round twice. */
  const sending = useRef(false);

  const words = useMemo(() => new Set(guessable), [guessable]);
  const outcome = outcomeOf(guesses, puzzle.answer);
  const over = outcome !== "playing";

  // The board as it was left. Read once on mount, because reading it on every
  // render would fight the state it restores.
  useEffect(() => {
    const saved = loadBoard(day);
    if (saved) {
      setGuesses(saved.guesses);
      recorded.current = saved.recorded;
    }
    setReady(true);
  }, [day]);

  useEffect(() => {
    if (!ready) return;
    saveBoard({ day, guesses, recorded: recorded.current });
  }, [ready, day, guesses]);

  /*
    The round is reported once, and the server decides what it was worth. Held
    behind `recorded` in the saved board as well as in a ref, so a reload after
    finishing does not send it again: `Review` is append-only, so a duplicate is
    a duplicate for ever.
  */
  useEffect(() => {
    if (!ready || !over || recorded.current) return;
    /*
      Marked as sent only once it has been. The obvious order is to set the
      flag first and fire, and that loses the round outright on a train: the
      board reopens tomorrow already recorded and the grade is gone. `Review`
      is append-only, so the thing to protect against is a *duplicate*, and the
      in-flight guard below does that within the tab while the saved flag does
      it across reloads. A round that could not be sent is simply sent again
      the next time the board is opened, which is the same day.
    */
    if (sending.current) return;
    sending.current = true;
    void recordSonad(day, guesses)
      .then((result) => {
        if (!result?.ok) return;
        recorded.current = true;
        saveBoard({ day, guesses, recorded: true });
      })
      /*
        A round that could not be sent leaves the flag alone and is sent again
        the next time the board opens. Caught rather than left to reject: an
        unhandled rejection is a page error, and the browser suites read those
        as faults, which a learner on a train is not.
      */
      .catch(() => {})
      .finally(() => { sending.current = false; });
  }, [ready, over, day, guesses]);

  const submit = useCallback(() => {
    if (over) return;
    const guess = typed.toLocaleLowerCase("et");
    if (!wellFormed(guess)) {
      setRefused(`${SONAD_LENGTH} letters, and Estonian ones.`);
      return;
    }
    if (!words.has(guess)) {
      setRefused("Not a word the dictionary knows.");
      return;
    }
    setRefused(null);
    setTyped("");
    setGuesses((made) => [...made, guess]);
  }, [over, typed, words]);

  /*
    Typing anywhere on the page, because a board you have to click into first
    swallows the first letter of every guess.

    A `keydown` and not an `input`, and that has a known edge: õ, ä, ö and ü
    reach this handler as themselves on an Estonian keyboard, where each is a
    real key, and may not reach it at all on a UK or US layout where they are
    composed or inserted. That is exactly the situation `lib/ux/letterBar.ts`
    exists for and it is why the keys below are a card rather than a hint:
    somebody without those keys taps them, which is what they already do
    everywhere else in the app. Catching a composition would want a hidden
    editable and the focus management that comes with it, on a screen where
    the keys are already on the page.
  */
  useEffect(() => {
    if (over) return;
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (event.key === "Enter") { event.preventDefault(); submit(); return; }
      if (event.key === "Backspace") {
        event.preventDefault();
        setRefused(null);
        setTyped((t) => [...t].slice(0, -1).join(""));
        return;
      }
      const letter = event.key.toLocaleLowerCase("et");
      if ([...letter].length === 1 && SONAD_KEYS.includes(letter)) {
        event.preventDefault();
        setRefused(null);
        setTyped((t) => ([...t].length >= SONAD_LENGTH ? t : t + letter));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [over, submit]);

  const marks = useMemo(() => letterMarks(guesses, puzzle.answer), [guesses, puzzle.answer]);
  const rows = Array.from({ length: SONAD_GUESSES }, (_, i) => i);
  const at = solvedAt(guesses, puzzle.answer);

  /* What the board is allowed to say, and what it may promise. Both are pure
     functions of how many guesses have been made: see `cluesAt`. */
  const clue = cluesAt(guesses.length);
  const coming = nextClue(guesses.length, puzzle.category !== null);
  const vowels = vowelCount(puzzle.answer);

  /*
    A tally rather than a board. `aria-live` on the six rows read every circle
    out again after every guess, which is 36 labels for six letters of news.
  */
  const spoken = useMemo(() => {
    const last = guesses[guesses.length - 1];
    if (!last) return "";
    const scored = scoreGuess(last, puzzle.answer);
    const count = (mark: Mark) => scored.filter((m) => m === mark).length;
    return `${last}: ${count("here")} in place, ${count("elsewhere")} elsewhere.`;
  }, [guesses, puzzle.answer]);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {/*
            What is known from the first row: what kind of word and how hard it
            is meant to be. Enough to make a first guess informed rather than a
            probe, and nowhere near enough to give it away.
          */}
          <Chip tone="neutral">{puzzle.pos.toLowerCase()}</Chip>
          {puzzle.cefr && <Chip tone="neutral">{puzzle.cefr}</Chip>}
          <span className="text-sm" style={{ color: "var(--ink-3)" }}>
            {SONAD_LENGTH} letters, {SONAD_GUESSES - guesses.length} left
          </span>
        </div>

        {/*
          THE LADDER, AND IT SAYS WHAT IS COMING BEFORE IT COMES.

          A clue that appears out of nowhere reads as the rules moving under
          you, so the line under the chips is either the clue or the promise
          of it. `cluesAt` decides when, in one pure function with the rules
          in it, because "on the last try" has to move with the number of
          tries rather than be typed here.

          Announced politely as well as printed: a clue arriving is news, and
          it lands under a board a screen reader has already been read.
        */}
        {!over && (clue.category || clue.vowels || coming) && (
          <p className="mt-2.5 text-sm" role="status" aria-live="polite" style={{ color: "var(--ink-2)" }}>
            {clue.category && puzzle.category && (
              <span className="font-semibold" style={{ color: "var(--accent-deep)" }}>
                It is {puzzle.category}.
              </span>
            )}
            {clue.vowels && (
              <span className="font-semibold" style={{ color: "var(--accent-deep)" }}>
                {clue.category && puzzle.category ? " " : ""}
                {vowels} of the six letters {vowels === 1 ? "is a vowel" : "are vowels"}.
              </span>
            )}
            {coming && (
              <span style={{ color: "var(--ink-3)" }}>
                {clue.category && puzzle.category ? " Next: " : ""}{coming}
              </span>
            )}
          </p>
        )}

        <div className="mt-4 flex flex-col items-center gap-2">
          {rows.map((row) => (
            <Row
              key={row}
              guess={guesses[row]}
              typed={row === guesses.length && !over ? typed : undefined}
              answer={puzzle.answer}
              refused={row === guesses.length && refused !== null}
              won={outcome === "won" && at === row + 1}
            />
          ))}
        </div>

        <span className="sr-only" role="status" aria-live="polite">{spoken}</span>

        {refused && (
          <p className="mt-3 text-center text-sm" style={{ color: "var(--again-ink)" }}>{refused}</p>
        )}
      </Card>

      {over ? (
        <Finish puzzle={puzzle} outcome={outcome} at={at} kept={kept} onKeep={() => setKept(true)} />
      ) : (
        <Keys
          marks={marks}
          onLetter={(letter) => {
            setRefused(null);
            setTyped((t) => ([...t].length >= SONAD_LENGTH ? t : t + letter));
          }}
          onDelete={() => { setRefused(null); setTyped((t) => [...t].slice(0, -1).join("")); }}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

function Row({ guess, typed, answer, refused, won }: {
  guess?: string;
  typed?: string;
  answer: string;
  refused: boolean;
  won: boolean;
}) {
  const marks = guess ? scoreGuess(guess, answer) : null;
  const letters = [...(guess ?? typed ?? "")];
  const slots = Array.from({ length: SONAD_LENGTH }, (_, i) => i);

  return (
    <div className={`flex gap-1.5 ${refused ? "sonad-refuse" : ""}`}>
      {slots.map((i) => {
        const letter = letters[i] ?? "";
        const mark = marks?.[i];
        const hue = mark ? HUE[mark] : EMPTY;
        return (
          <span
            key={i}
            lang="et"
            aria-label={mark ? `${letter}, ${SPOKEN[mark]}` : undefined}
            /*
              The circles settle when a guess lands and rise when it was the
              answer, staggered along the row by `--sonad-at`. See the block in
              globals.css for why neither of those is a flip.
            */
            className={`grid h-11 w-11 place-items-center rounded-full text-lg font-bold uppercase sm:h-12 sm:w-12 ${
              won ? "sonad-rise" : marks ? "sonad-settle" : ""
            }`}
            style={{
              "--sonad-at": i,
              background: hue.bg,
              color: hue.ink,
              boxShadow: `inset 0 0 0 ${mark ? RING[mark] : "2px"} ${hue.ring}`,
            } as React.CSSProperties}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
}

function Keys({ marks, onLetter, onDelete, onSubmit }: {
  marks: Map<string, Mark>;
  onLetter: (letter: string) => void;
  onDelete: () => void;
  onSubmit: () => void;
}) {
  return (
    <Card>
      {/*
        Three rows rather than a grid, because the rows are the layout: a key
        is found by where it sits relative to the ones round it, and a grid
        eight wide puts `p` under `h` on a phone and somewhere else on a
        laptop. Each row fills the width it is given, so the twelve keys of
        the top row and the nine of the bottom are the same row of a keyboard
        at every width, exactly as they are on a real one.

        `flex-1 basis-0 min-w-0` rather than a fixed width: at 360px twelve
        keys and their gaps come to about 25px each, which is what every phone
        keyboard is, and the height stays 44 so a thumb has the target the
        floor asks for on the axis a thumb actually misses.
      */}
      <div className="flex flex-col gap-1.5">
        {SONAD_KEY_ROWS.map((row, i) => (
          <div key={i} className="flex justify-center gap-1 sm:gap-1.5">
            {row.map((letter) => {
              const mark = marks.get(letter);
              const hue = mark ? HUE[mark] : { bg: "var(--surface)", ink: "var(--ink)", ring: "var(--rule)" };
              const ring = mark ? RING[mark] : "1px";
              return (
                <button
                  key={letter}
                  type="button"
                  onClick={() => onLetter(letter)}
                  lang="et"
                  aria-label={letter}
                  className="press tap-tint grid h-11 min-w-0 flex-1 basis-0 place-items-center rounded-[var(--r-sm)] text-sm font-semibold uppercase transition-ui sm:text-base"
                  style={{
                    background: hue.bg,
                    color: hue.ink,
                    boxShadow: ring === "0" ? "none" : `inset 0 0 0 ${ring} ${hue.ring}`,
                  }}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="secondary" onClick={onDelete} className="flex-1">
          <Delete size={16} aria-hidden /> Delete
        </Button>
        <Button type="button" variant="primary" onClick={onSubmit} className="flex-1">
          <CornerDownLeft size={16} aria-hidden /> Guess
        </Button>
      </div>
    </Card>
  );
}

function Finish({ puzzle, outcome, at, kept, onKeep }: {
  puzzle: Puzzle;
  outcome: "won" | "lost";
  at: number | null;
  kept: boolean;
  onKeep: () => void;
}) {
  const [pending, setPending] = useState(false);

  return (
    <Card>
      <p className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
        {outcome === "won"
          ? at === 1 ? "First guess." : `Got it in ${at}.`
          : "Not this time."}
      </p>
      <p className="mt-2 text-base" style={{ color: "var(--ink-2)" }}>
        <Link
          href={`/dictionary?q=${encodeURIComponent(puzzle.answer)}`}
          className="font-semibold underline underline-offset-2"
          style={{ color: "var(--accent-deep)" }}
          lang="et"
        >
          {puzzle.answer}
        </Link>
        {" is "}
        {puzzle.translation}.
      </p>
      {/*
        The offer, and only where there is one to make. A word already in the
        deck was graded by the round itself, and saying so would be reporting on
        the scheduler at somebody who came here to play.
      */}
      {!kept && (
        <Button
          type="button"
          variant="primary"
          className="mt-4"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            const result = await addToDeck(puzzle.lexemeId, ["RECOGNITION", "PRODUCTION"], "DICTIONARY");
            setPending(false);
            if (result.ok) onKeep();
          }}
        >
          {pending ? "Adding" : "Keep this word"}
        </Button>
      )}
      {kept && (
        <p className="mt-4 text-sm" style={{ color: "var(--ink-3)" }}>
          It is in your deck, so this round counted towards it.
        </p>
      )}
      <p className="mt-4 text-sm" style={{ color: "var(--ink-3)" }}>
        A new word every morning.
      </p>
    </Card>
  );
}
