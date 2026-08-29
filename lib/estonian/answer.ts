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
const FOLD: Record<string, string> = {
  õ: "o", ä: "a", ö: "o", ü: "u", š: "s", ž: "z",
};

function fold(text: string): string {
  return [...text].map((ch) => FOLD[ch] ?? ch).join("");
}

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
 * The accepted answers hidden inside one stored string.
 *
 * Dictionary values genuinely carry alternatives — `raamatutes / raamatuis` are
 * both right, and an English gloss is often `woman, wife`. Splitting on `/` and
 * `,` means a learner is never marked wrong for picking the other true answer.
 * A parenthetical `(some)` is treated as optional, so both readings are accepted.
 */
export function acceptedAnswers(expected: string, language: "et" | "en"): string[] {
  const out = new Set<string>();
  for (const raw of expected.split(/\s*[/,;]\s*|\s+or\s+/)) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const withParens = normalise(trimmed.replace(/[()]/g, " "), language);
    const withoutParens = normalise(trimmed.replace(/\([^)]*\)/g, " "), language);
    if (withParens) out.add(withParens);
    if (withoutParens) out.add(withoutParens);
  }
  if (out.size === 0) {
    const fallback = normalise(expected, language);
    if (fallback) out.add(fallback);
  }
  return [...out];
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

/** Which diacritics were dropped, e.g. "õ, not o" — the actually useful hint. */
function diacriticNote(typed: string, expected: string): string {
  const missed: string[] = [];
  for (let i = 0; i < expected.length && i < typed.length; i++) {
    const e = expected[i]!;
    const t = typed[i]!;
    if (e !== t && FOLD[e] === t) missed.push(`${e}, not ${t}`);
  }
  const unique = [...new Set(missed)];
  return unique.length > 0
    ? `Almost, it's ${unique.join(" and ")}.`
    : "Almost, check the letters with dots and tildes.";
}

/**
 * Compares a typed answer with the stored one.
 *
 * `language` decides how forgiving the normalisation is: an English gloss may
 * lose its article, an Estonian form may not lose anything at all.
 */
export function checkAnswer(
  typed: string,
  expected: string,
  language: "et" | "en" = "et",
): AnswerCheck {
  const answers = acceptedAnswers(expected, language);
  const given = normalise(typed, language);
  const primary = answers[0] ?? normalise(expected, language);

  if (!given) {
    return { verdict: "wrong", expected, note: "Nothing typed.", suggestedRating: 1 };
  }

  if (answers.includes(given)) {
    return { verdict: "correct", expected, note: "", suggestedRating: 3 };
  }

  // Diacritics first: `soidan` matching `sõidan` is a spelling slip, not a typo,
  // and the learner gets told exactly which letter it was.
  const givenFolded = fold(given);
  for (const answer of answers) {
    if (fold(answer) === givenFolded) {
      return {
        verdict: "diacritics",
        expected: answer,
        note: diacriticNote(given, answer),
        suggestedRating: 2,
      };
    }
  }

  // A single slipped keystroke. Short words are excluded: at three letters,
  // one edit is usually a different word rather than a mistyped one.
  for (const answer of answers) {
    if (answer.length >= 4 && editDistance(given, answer, 1) <= 1) {
      return {
        verdict: "typo",
        expected: answer,
        note: `So close, the word is “${answer}”.`,
        suggestedRating: 2,
      };
    }
  }

  return {
    verdict: "wrong",
    expected: primary,
    note: `Not quite, it's “${primary}”.`,
    suggestedRating: 1,
  };
}

/** True when a verdict should still count as recalled in the session tally. */
export function countsAsRecalled(verdict: Verdict): boolean {
  return verdict === "correct" || verdict === "diacritics" || verdict === "typo";
}
