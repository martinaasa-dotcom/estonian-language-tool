/**
 * Grading a typed answer.
 *
 * Typing the word is a stronger test than looking at it and clicking "I knew
 * that" — it is what Speakly gets right and a self-graded flashcard cannot.
 * The interesting part is being fair about it. Three kinds of near-miss have to
 * be told apart, because they mean different things to a learner:
 *
 * - **A diacritic slip** (`soidan` for `sõidan`). Estonian õ/ä/ö/ü are separate
 *   letters and `sõda` (war) is not `soda`, so this can never be silently
 *   accepted — but it is not the same failure as not knowing the word either.
 * - **A typo** (`raamtu` for `raamatu`) — one keystroke out.
 * - **Actually wrong.**
 *
 * Nothing here generates an Estonian form; it only compares what was typed to a
 * form that already came from the dictionary (ADR-005 stays intact).
 */

import { FOLD, fold } from "@/lib/estonian/fold";

export type Verdict = "correct" | "diacritics" | "typo" | "wrong";

export interface AnswerCheck {
  verdict: Verdict;
  /** The alternative the answer came closest to — what the UI should show. */
  expected: string;
  /** A one-line explanation, ready to display. Empty for a clean hit. */
  note: string;
  /** The rating to suggest for FSRS. The learner can still override it. */
  suggestedRating: 1 | 2 | 3;
}

/** Estonian letters that are their own letter, not an accented Latin one. */
/** Lowercase, collapse whitespace, drop surrounding punctuation and articles. */
function normalise(text: string, language: "et" | "en"): string {
  let s = text
    .toLowerCase()
    .normalize("NFC")
    .replace(/[!?.,;:"'`´’]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (language === "en") {
    // "to read" / "read", "a book" / "the book" — the article is not the point.
    s = s.replace(/^(to|a|an|the)\s+/, "");
  }
  return s;
}

/**
 * One accepted answer, in both of the shapes a marker needs.
 *
 * `normalise` lowercases, drops punctuation and, in English, an article. That
 * is exactly right for deciding whether two answers are the same and exactly
 * wrong for printing one, and for a long time the two were the same string.
 * So a learner who missed `Eesti` was corrected to `eesti`, which is a
 * different word (the language, not the country); `Head aega!` came back as
 * `head aega`, `Aitäh!` as `aitäh`, `April` as `april` and `To sleep` as
 * `sleep`. Roughly one shipped entry in five prints a form the dictionary
 * never held, on the one screen in the app worth stopping at.
 *
 * A stored value genuinely carries alternatives: `raamatutes / raamatuis` are
 * both right and an English gloss is often `woman, wife`, so each part is
 * accepted on its own and a parenthetical `(some)` is optional. Both readings
 * of a part point back at the part as written, because the parentheses are
 * what the dictionary says.
 */
export interface Accepted {
  /** The spelling the dictionary holds, which is the one to print. */
  shown: string;
  /** The same answer flattened, which is the one to compare against. */
  compared: string;
}

export function acceptedForms(expected: string, language: "et" | "en"): Accepted[] {
  const out: Accepted[] = [];
  const seen = new Set<string>();
  const add = (shown: string, compared: string) => {
    if (!compared || seen.has(compared)) return;
    seen.add(compared);
    out.push({ shown, compared });
  };
  for (const raw of expected.split(/\s*[/,;]\s*|\s+or\s+/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    add(trimmed, normalise(trimmed.replace(/[()]/g, " "), language));
    add(trimmed, normalise(trimmed.replace(/\([^)]*\)/g, " "), language));
  }
  if (out.length === 0) add(expected.trim(), normalise(expected, language));
  return out;
}

/** Every spelling a marker lets through, flattened for comparison. */
export function acceptedAnswers(expected: string, language: "et" | "en"): string[] {
  return acceptedForms(expected, language).map((accepted) => accepted.compared);
}

/** Levenshtein distance, bailing out once it is past `max` (we only care about 1–2). */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i, ...Array<number>(b.length).fill(0)];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        (row[j - 1] ?? 0) + 1,
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + cost,
      );
      best = Math.min(best, row[j]!);
    }
    if (best > max) return max + 1;
    prev = row;
  }
  return prev[b.length] ?? max + 1;
}

/**
 * Which diacritics were dropped, each as "õ, not o".
 *
 * Exported because dictation needs the same sentence about the same mistake,
 * and it marks word by word where this marks a whole answer. A second copy of
 * this loop is where the two would drift: one of them would learn about a
 * letter the other did not.
 *
 * Nothing here writes Estonian. Every character it names is read out of the
 * expected form, which came from Ekilex or the seeded principal parts, and
 * the comparison is the same latitude `cloze.ts` takes (ADR-005).
 */
export function droppedDiacritics(typed: string, expected: string): string[] {
  const missed: string[] = [];
  for (let i = 0; i < expected.length && i < typed.length; i++) {
    const e = expected[i]!;
    const t = typed[i]!;
    if (e !== t && FOLD[e] === t) missed.push(`${e}, not ${t}`);
  }
  return [...new Set(missed)];
}

/** Which diacritics were dropped, e.g. "õ, not o" — the actually useful hint. */
function diacriticNote(typed: string, expected: string): string {
  const unique = droppedDiacritics(typed, expected);
  return unique.length > 0
    ? `Almost, it's ${unique.join(" and ")}.`
    : "Almost, check the letters with dots and tildes.";
}

/**
 * A form in quotes at the end of a sentence.
 *
 * Some stored answers carry their own terminal punctuation, and a full stop
 * after `Head aega!` reads as a second one.
 */
function closing(form: string): string {
  return /[!?.]$/.test(form) ? `“${form}”` : `“${form}”.`;
}

/**
 * Compares a typed answer with the stored one.
 *
 * `language` decides how forgiving the normalization is: an English gloss may
 * lose its article, an Estonian form may not lose anything at all.
 */
export function checkAnswer(
  typed: string,
  expected: string,
  language: "et" | "en" = "et",
): AnswerCheck {
  const answers = acceptedForms(expected, language);
  const given = normalise(typed, language);
  const primary = answers[0]?.shown ?? expected.trim();

  if (!given) {
    return { verdict: "wrong", expected, note: "Nothing typed.", suggestedRating: 1 };
  }

  if (answers.some((answer) => answer.compared === given)) {
    return { verdict: "correct", expected, note: "", suggestedRating: 3 };
  }

  // Diacritics first: `soidan` matching `sõidan` is a spelling slip, not a typo,
  // and the learner gets told exactly which letter it was. The letters are named
  // off the flattened pair, which is the one that lines up character for
  // character; what is shown back is the spelling that was stored.
  const givenFolded = fold(given);
  for (const answer of answers) {
    if (fold(answer.compared) === givenFolded) {
      return {
        verdict: "diacritics",
        expected: answer.shown,
        note: diacriticNote(given, answer.compared),
        suggestedRating: 2,
      };
    }
  }

  // A single slipped keystroke. Short words are excluded: at three letters,
  // one edit is usually a different word rather than a mistyped one.
  for (const answer of answers) {
    if (answer.compared.length >= 4 && editDistance(given, answer.compared, 1) <= 1) {
      return {
        verdict: "typo",
        expected: answer.shown,
        note: `So close, the word is ${closing(answer.shown)}`,
        suggestedRating: 2,
      };
    }
  }

  return {
    verdict: "wrong",
    expected: primary,
    note: `Not quite, it's ${closing(primary)}`,
    suggestedRating: 1,
  };
}

/** True when a verdict should still count as recalled in the session tally. */
export function countsAsRecalled(verdict: Verdict): boolean {
  return verdict === "correct" || verdict === "diacritics" || verdict === "typo";
}
