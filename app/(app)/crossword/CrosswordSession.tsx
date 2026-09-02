"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Button } from "@/components/Button";
import { DiacriticBar } from "@/components/DiacriticBar";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { cellsOf, solvedEntries, wrongCells, type Entry } from "@/lib/games/crossword";
import type { DailyCrossword } from "@/lib/progress/crossword";
import { recordCrossword } from "@/app/actions";
import { loadGrid, saveGrid } from "./resume";

/**
 * THE DAILY CROSSWORD'S GRID.
 *
 * A real input per cell rather than one hidden field and a keydown handler,
 * which is the opposite of the choice Sõnad made and is right for the opposite
 * reason. Sõnad is one word at a time with a card of keys under it; this has
 * thirty cells in two directions, so the caret has to be somewhere the reader
 * can see, a phone has to open its own keyboard, and a composed õ has to
 * arrive. An `input` event carries a composition where a `keydown` does not,
 * which is why the letter bar under the grid is the app's own `DiacriticBar`
 * and works here with nothing added: it types into whatever has focus.
 *
 * EMPTY CELLS ARE NOTHING, NOT BLACK SQUARES. A criss-cross is mostly empty by
 * construction, and a nine by nine grid with sixty black squares in it reads as
 * a rendering fault rather than as a puzzle.
 */
export function CrosswordSession({ puzzle, day }: { puzzle: DailyCrossword; day: string }) {
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [active, setActive] = useState(0);
  const [checked, setChecked] = useState<number[]>([]);
  const [helped, setHelped] = useState<number[]>([]);
  const [ready, setReady] = useState(false);
  const recorded = useRef(false);
  /** In flight, so a re-render does not send the same grid twice. */
  const sending = useRef(false);
  const cells = useRef(new Map<number, HTMLInputElement>());

  useEffect(() => {
    const saved = loadGrid(day);
    if (saved) {
      setTyped(saved.typed);
      setHelped(saved.helped);
      recorded.current = saved.recorded;
    }
    setReady(true);
  }, [day]);

  useEffect(() => {
    if (!ready) return;
    saveGrid({ day, typed, helped, recorded: recorded.current });
  }, [ready, day, typed, helped]);

  const solved = useMemo(() => solvedEntries(puzzle, typed), [puzzle, typed]);
  const done = solved.size === puzzle.entries.length;

  /*
    Reported once, and the server decides what it was worth: it rebuilds the
    day's grid and checks the letters, so a filled-in grid is the only way to a
    Good. What it cannot check is whether the Check button was used, which only
    ever makes a rating worse, and is the same latitude Sõnad's guess list has.
  */
  useEffect(() => {
    if (!ready || !done || recorded.current) return;
    // Marked as sent only once it has been, for the reason Sõnad's own
    // reporting gives: setting the flag first loses the round outright on a
    // train, and `Review` being append-only means the thing to guard is a
    // duplicate rather than a retry.
    if (sending.current) return;
    sending.current = true;
    void recordCrossword(day, typed, helped)
      .then((result) => {
        if (!result?.ok) return;
        recorded.current = true;
        saveGrid({ day, typed, helped, recorded: true });
      })
      /*
        A round that could not be sent leaves the flag alone and is sent again
        the next time the board opens. Caught rather than left to reject: an
        unhandled rejection is a page error, and the browser suites read those
        as faults, which a learner on a train is not.
      */
      .catch(() => {})
      .finally(() => { sending.current = false; });
  }, [ready, done, day, typed, helped]);

  const entry = puzzle.entries[active] ?? puzzle.entries[0]!;
  const activeCells = useMemo(() => cellsOf(entry, puzzle.cols), [entry, puzzle.cols]);
  const wrong = useMemo(
    () => (checked.length > 0 ? wrongCells(puzzle, typed) : new Set<number>()),
    [checked, puzzle, typed],
  );

  const focusCell = useCallback((cell: number) => {
    cells.current.get(cell)?.focus();
    cells.current.get(cell)?.select();
  }, []);

  /** Which entry a cell belongs to, preferring the one already selected. */
  const pick = useCallback((cell: number) => {
    const holding = puzzle.entries
      .map((e, i) => ({ i, cells: cellsOf(e, puzzle.cols) }))
      .filter((e) => e.cells.includes(cell));
    if (holding.length === 0) return;
    // A second tap on the same cell turns the corner, which is how every
    // crossword works and is the only way to reach a down clue by touch.
    const already = holding.findIndex((h) => h.i === active);
    const next = already >= 0 ? holding[(already + 1) % holding.length]! : holding[0]!;
    setActive(next.i);
    focusCell(cell);
  }, [puzzle, active, focusCell]);

  function write(cell: number, value: string) {
    const letter = [...value.toLocaleLowerCase("et")].at(-1) ?? "";
    setChecked([]);
    setTyped((held) => {
      const next = { ...held };
      if (letter) next[cell] = letter; else delete next[cell];
      return next;
    });
    if (letter) {
      const at = activeCells.indexOf(cell);
      const after = activeCells[at + 1];
      if (after !== undefined) focusCell(after);
    }
  }

  function onKey(cell: number, key: string) {
    const at = activeCells.indexOf(cell);
    if (key === "Backspace" && !typed[cell] && at > 0) {
      focusCell(activeCells[at - 1]!);
    } else if (key === "ArrowRight" || key === "ArrowDown") {
      const after = activeCells[at + 1];
      if (after !== undefined) focusCell(after);
    } else if (key === "ArrowLeft" || key === "ArrowUp") {
      if (at > 0) focusCell(activeCells[at - 1]!);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div
          className="mx-auto grid w-fit gap-1"
          style={{ gridTemplateColumns: `repeat(${puzzle.cols}, minmax(0, 1fr))` }}
          /*
            A GROUP RATHER THAN A GRID, WHICH AXE IS RIGHT ABOUT.

            `role="grid"` promises rows: an element with it must hold `row`
            children holding `gridcell` children, and a screen reader offers
            the grid navigation model on the strength of that promise. This is
            one flat CSS grid of cells with no row elements in it, so the
            promise was false and `aria-required-children` fired on it, which
            nothing noticed because the route was not in the accessibility
            suite's list until now.

            Wrapping each row in a `role="row"` with `display: contents` is the
            other fix and buys nothing here: the navigation this actually
            offers is a real `<input>` per cell, each labelled with its own row
            and column, which is what a screen reader user needs and is already
            there. A group says "these controls belong together", which is
            exactly what is true.
          */
          role="group"
          aria-label="Crossword grid"
        >
          {Array.from({ length: puzzle.rows * puzzle.cols }, (_, cell) => {
            if (!puzzle.filled.has(cell)) return <span key={cell} aria-hidden className="h-9 w-9 sm:h-10 sm:w-10" />;
            const number = puzzle.entries.find(
              (e) => e.row * puzzle.cols + e.col === cell,
            )?.number;
            const inWord = activeCells.includes(cell);
            const isWrong = wrong.has(cell);
            return (
              <span key={cell} className="relative h-9 w-9 sm:h-10 sm:w-10">
                {number !== undefined && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute left-[3px] top-0 font-bold leading-none"
                    /*
                      The smallest step on the scale rather than a size typed
                      here: `docs/14-design-system.md` puts a floor at 10.5px
                      and this was 9, which is the corner of a cell arguing it
                      is a special case. It is not: a clue number is read.
                    */
                    style={{ color: "var(--ink-3)", fontSize: "var(--text-2xs)" }}
                  >
                    {number}
                  </span>
                )}
                <input
                  ref={(el) => { if (el) cells.current.set(cell, el); else cells.current.delete(cell); }}
                  value={typed[cell] ?? ""}
                  onChange={(e) => write(cell, e.target.value)}
                  onKeyDown={(e) => onKey(cell, e.key)}
                  onFocus={() => { if (!activeCells.includes(cell)) pick(cell); }}
                  onClick={() => pick(cell)}
                  lang="et"
                  aria-label={`Row ${Math.floor(cell / puzzle.cols) + 1}, column ${(cell % puzzle.cols) + 1}`}
                  className="h-full w-full rounded-[var(--r-sm)] border-0 text-center text-base font-bold uppercase outline-none transition-ui"
                  style={{
                    background: isWrong
                      ? "var(--again-soft)"
                      : inWord ? "var(--accent-soft)" : "var(--raised)",
                    color: isWrong ? "var(--again-ink)" : "var(--ink)",
                    boxShadow: `inset 0 0 0 1px var(--rule-soft)`,
                  }}
                />
              </span>
            );
          })}
        </div>

        <div className="mt-4 flex flex-col items-center gap-3">
          <p className="text-center text-sm" style={{ color: "var(--ink-2)" }}>
            <span className="font-semibold">{entry.number} {entry.direction}</span>
            {": "}
            {entry.clue}
          </p>
          <DiacriticBar standalone={false} label="Insert Estonian character" />
        </div>
      </Card>

      {done ? (
        <Finish puzzle={puzzle} helped={helped.length} />
      ) : (
        <Card>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => setChecked(Object.keys(typed).map(Number))}
            >
              <Check size={16} aria-hidden /> Check
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setHelped((was) => (was.includes(active) ? was : [...was, active]));
                setTyped((held) => {
                  const next = { ...held };
                  cellsOf(entry, puzzle.cols).forEach((cell, i) => {
                    next[cell] = [...entry.lemma.toLocaleLowerCase("et")][i] ?? "";
                  });
                  return next;
                });
              }}
            >
              <Eye size={16} aria-hidden /> Show this one
            </Button>
          </div>
        </Card>
      )}

      <Clues puzzle={puzzle} active={active} solved={solved} onPick={(i) => {
        setActive(i);
        focusCell(cellsOf(puzzle.entries[i]!, puzzle.cols)[0]!);
      }} />
    </div>
  );
}

function Clues({ puzzle, active, solved, onPick }: {
  puzzle: DailyCrossword;
  active: number;
  solved: Set<number>;
  onPick: (index: number) => void;
}) {
  const half = (direction: Entry["direction"]) =>
    puzzle.entries.map((e, i) => ({ e, i })).filter(({ e }) => e.direction === direction);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {(["across", "down"] as const).map((direction) => (
        <Card key={direction}>
          <SectionTitle>{direction === "across" ? "Across" : "Down"}</SectionTitle>
          <ul className="mt-2 flex flex-col gap-1">
            {half(direction).map(({ e, i }) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onPick(i)}
                  className="tap-tint flex w-full items-baseline gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left text-sm"
                  style={{
                    color: solved.has(i) ? "var(--ink-3)" : "var(--ink-2)",
                    background: i === active ? "var(--accent-soft)" : "transparent",
                  }}
                >
                  <span className="font-bold" style={{ color: "var(--ink-3)" }}>{e.number}</span>
                  <span>{e.clue}</span>
                  {solved.has(i) && <Check size={13} aria-hidden style={{ color: "var(--mint-ink)" }} />}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function Finish({ puzzle, helped }: { puzzle: DailyCrossword; helped: number }) {
  return (
    <Card>
      <p className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
        {helped === 0 ? "All of it, on your own." : "Finished."}
      </p>
      <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
        {puzzle.inDeck.length > 0
          ? `${puzzle.inDeck.length} of these are in your deck, so the round counted towards them.`
          : "None of these are in your deck yet. Open one and keep it."}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {puzzle.entries.map((entry) => (
          <li key={entry.lexemeId}>
            <Link
              href={`/dictionary?q=${encodeURIComponent(entry.lemma)}`}
              className="tap-tint rounded-full"
            >
              <Chip tone="good"><span lang="et">{entry.lemma}</span></Chip>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm" style={{ color: "var(--ink-3)" }}>A new grid every morning.</p>
    </Card>
  );
}
