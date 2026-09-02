/**
 * DOES ANY QUESTION THIS APP ASKS PRINT ITS OWN ANSWER?
 *
 * It is the one question no unit test can ask, because every generator here is
 * correct on the word a fixture picks and wrong on a handful somewhere in five
 * thousand. Asked over the shipped dictionary rather than over a fixture, this
 * found four separate faults in one afternoon, and none of them were visible on
 * any single word:
 *
 *   2,468 gap-fills whose hint was the answer, wherever the gap wanted the
 *     dictionary form and the hint gave the lemma;
 *   115 case cards for a case Estonian spells like the nominative, so
 *     `kallis → milles? kus?` had `kallis` on the back;
 *   15 gaps that left the answer standing later in the same sentence;
 *   34 crossword clues that were the English gloss and the Estonian word at
 *     once, `film` clued as "film".
 *
 * A card nobody can get wrong is worse than no card. The scheduler reads every
 * pass as a recall and stretches the interval, so the slot is spent for ever,
 * and the learner is told they knew something they were shown.
 *
 * WHAT IT IS NOT. It does not judge whether a question is hard, or whether the
 * wrong answers are any good: `lib/questions/distractors.ts` is where that
 * lives and it was measured separately. This asks one mechanical thing, which
 * is why it can be trusted over 47,000 cards.
 *
 * Two shapes are deliberately not faults and are excluded by name rather than
 * by luck. A matching task shows the word list, because pairing sentences to
 * words needs both halves on screen. And a `heard` question hides its prompt
 * from the eye on purpose: the answer being written beside it is the exercise.
 * Both were reported by the first version of this and both were the harness.
 *
 * No database, no network: it reads `prisma/data/expanded.json`, which is what
 * `npm run db:seed` loads.
 */
import { readExpanded } from "./lib/expandedFile";
import { generateCards, availableCardTypes, type LexemeForCards } from "../lib/srs/cards";
import { buildPaper as buildExam, type PoolWord } from "../lib/exam/paper";
import { buildPaper as buildPlacement, type WordRow } from "../lib/assessment/items";
import { EXAM_LEVELS } from "../lib/exam/spec";
import { clueFrom } from "../lib/progress/crossword";
import { mentions } from "../lib/estonian/cloze";

interface Row { lemma: string; pos: string; cefr: string | null; translation: string;
  forms: { formType: string; value: string }[]; examples: { et: string; en?: string | null }[];
  government: string | null; gradation?: string | null; gradationNote?: string | null }

const entries = readExpanded() as unknown as Row[];

/** Everything a learner is shown, joined; and the string they have to produce. */
interface Asked { where: string; shown: string; answer: string }

const faults: Asked[] = [];
let asked = 0;

/*
  Where the time goes, printed, because the four generators are nothing like
  each other in cost and a reader deciding whether this belongs in CI needs to
  know which one to bound. The deck and the crossword read the file and are
  seconds; a paper is assembled per seed and is most of the run.
*/
const spent = new Map<string, number>();
function timed<T>(what: string, run: () => T): T {
  const began = Date.now();
  const out = run();
  spent.set(what, (spent.get(what) ?? 0) + (Date.now() - began));
  return out;
}

function ask(where: string, shown: string, answer: string): void {
  asked++;
  const wanted = answer.trim();
  if (wanted.length < 2 || !shown.trim()) return;
  // A case card's back is every accepted spelling, joined. Any one of them
  // showing is enough to make the card free.
  for (const one of wanted.split(" / ")) {
    if (mentions(shown, one)) { faults.push({ where, shown, answer: one }); return; }
  }
}

/* ── The deck ────────────────────────────────────────────────────────────── */
timed("deck", () => {
for (const e of entries) {
  const lex = {
    id: e.lemma, lemma: e.lemma, translation: e.translation, pos: e.pos,
    gradation: e.gradation ?? null, gradationNote: e.gradationNote ?? null,
    government: e.government ?? null, examples: JSON.stringify(e.examples ?? []),
    forms: (e.forms ?? []).map((f) => ({ formType: f.formType, value: f.value, morphCode: null })),
  } as unknown as LexemeForCards;
  let cards;
  try { cards = generateCards(lex, availableCardTypes(lex)); }
  catch (error) { faults.push({ where: `card ${e.lemma}`, shown: String(error), answer: "threw" }); continue; }
  for (const c of cards) {
    // A recognition or production card of a word spelled the same in both
    // languages is the same string twice and is a fact about the word, said in
    // words on every screen that prints it. See `sameSpelling`.
    if (c.cardType === "RECOGNITION" || c.cardType === "PRODUCTION") continue;
    ask(`${c.cardType} ${e.lemma}`, `${c.front} ${c.hint ?? ""}`, c.back);
  }
}
});

/* ── The mock exam ───────────────────────────────────────────────────────── */
const pool: PoolWord[] = entries.map((e) => ({
  lexemeId: e.lemma, lemma: e.lemma, translation: e.translation, pos: e.pos, cefr: e.cefr,
  forms: (e.forms ?? []).map((f) => ({ formType: f.formType, value: f.value, morphCode: null, morphName: null })),
  examples: (e.examples ?? []).map((x) => ({ et: x.et, en: x.en ?? null })),
  government: e.government, cardId: null,
}));
const SEEDS = Number(process.argv.find((a) => a.startsWith("--seeds="))?.split("=")[1] ?? 10);
timed("exam", () => {
for (const level of EXAM_LEVELS) {
  for (let s = 0; s < SEEDS; s++) {
    for (const part of buildExam(level, pool, `audit-${s}`).parts) {
      for (const task of part.tasks) {
        for (const item of task.items as unknown as Record<string, unknown>[]) {
          // `lemma` on a matching task is the word list, which is the exercise.
          const shown = [item.prompt, item.sentence, item.text, item.hint]
            .filter((x): x is string => typeof x === "string").join(" ");
          ask(`exam ${level} ${task.spec.kind}`, shown, String(item.answer ?? ""));
        }
      }
    }
  }
}
});

/* ── The level check ─────────────────────────────────────────────────────── */
const words: WordRow[] = entries.map((e) => ({
  id: e.lemma, lemma: e.lemma, translation: e.translation, pos: e.pos, cefr: e.cefr,
  government: e.government,
  forms: (e.forms ?? []).map((f) => ({ formType: f.formType, value: f.value, morphCode: null })),
  examples: (e.examples ?? []).map((x) => ({ et: x.et, en: x.en ?? null })),
}));
timed("check", () => {
/*
  A HUNDRED WORDS A BAND, WHICH IS THE POOL THE APP HANDS IT. `paperFor` reads
  `PER_BAND * 2` rows per band and passes at most `PER_BAND` of them on, so
  giving this the whole dictionary asks a question the app never asks and takes
  minutes doing it: the first version of this audit ran for twelve. The window
  moves with the seed, the way the query's `skip` does, so successive seeds see
  different words rather than the same hundred five times.
*/
const PER_BAND = 100;
const banded = new Map<string, WordRow[]>();
for (const w of words) {
  if (!w.cefr) continue;
  const list = banded.get(w.cefr) ?? [];
  list.push(w);
  banded.set(w.cefr, list);
}
function poolFor(seed: number): WordRow[] {
  const out: WordRow[] = [];
  for (const list of banded.values()) {
    const start = list.length > PER_BAND ? (seed * PER_BAND) % (list.length - PER_BAND) : 0;
    out.push(...list.slice(start, start + PER_BAND));
  }
  return out;
}

for (let seed = 1; seed <= SEEDS; seed++) {
  const paper = buildPlacement(poolFor(seed), seed) as unknown as Record<string, unknown>;
  for (const [skill, list] of Object.entries(paper)) {
    if (!Array.isArray(list)) continue;
    for (const item of list as Record<string, unknown>[]) {
      // A listening question hides its prompt from the eye on purpose.
      if (item.heard) continue;
      const options = (item.options ?? []) as string[];
      const answer = typeof item.answer === "number" ? options[item.answer] ?? "" : String(item.answer ?? "");
      ask(`check ${skill} ${String(item.kind)}`, String(item.et ?? ""), answer);
    }
  }
}
});

/* ── The crossword ───────────────────────────────────────────────────────── */
timed("crossword", () => {
for (const e of entries) {
  const clue = clueFrom(e.translation ?? "", e.lemma);
  if (clue) ask(`crossword ${e.lemma}`, clue, e.lemma);
}
});

/* ── The verdict ─────────────────────────────────────────────────────────── */

/*
  A FLOOR, BECAUSE AN AUDIT THAT ASKED NOTHING LOOKS EXACTLY LIKE ONE THAT
  PASSED. Every generator above is wrapped in a loop over the dictionary, and
  every one of those loops is a `continue` away from asking nothing at all: a
  changed export, an empty pool, a builder that starts returning no items. This
  printed "None of them prints its own answer" in each of those cases, which is
  the fault `scripts/lib/checks.mjs` exists for one directory over, arriving
  here because an audit script is not a suite and gets no floor for free.

  The number is what a full run reaches, rounded down hard rather than pinned:
  this is a bound on "did it run", not a second assertion about the dictionary,
  and a floor nobody can pass is a floor somebody lowers.
*/
const FLOOR = 40_000;

console.log(`Asked ${asked.toLocaleString("en-GB")} questions over ${entries.length.toLocaleString("en-GB")} entries.`);
console.log(
  "  "
  + [...spent].map(([what, ms]) => `${what} ${Math.round(ms / 100) / 10}s`).join(", ")
  + ` (${SEEDS} seeds per paper)`,
);
if (asked < FLOOR) {
  console.error(
    `\nOnly ${asked.toLocaleString("en-GB")} questions were built, against a floor of `
    + `${FLOOR.toLocaleString("en-GB")}. Something above stopped producing rather than started `
    + "passing: check that the dictionary loaded and that every generator still returns items.",
  );
  process.exit(1);
}
if (faults.length === 0) {
  console.log("None of them prints its own answer.");
  process.exit(0);
}
console.log(`\n${faults.length} print the answer they ask for:\n`);
for (const f of faults.slice(0, 40)) {
  console.log(`  ${f.where}\n     shows "${f.shown.slice(0, 90)}"\n     wants "${f.answer}"`);
}
if (faults.length > 40) console.log(`  ...and ${faults.length - 40} more.`);
process.exit(1);
