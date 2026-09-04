/*
  THE TWO LINES IN A REPLY THAT ARE ESTONIAN BY CONSTRUCTION.

  `FIX:` carries a corrected sentence and `VOCAB:` a word pair that can become
  a flashcard. Three modules have to recognise them, for three different
  reasons, and each used to carry its own regex: `humanize.ts` so it never
  rewrites punctuation inside one, `verify.ts` so it does not flag a word the
  UI already boxes and tags, and `AnuParts.tsx` so it can lift the line out
  of the prose and draw it as the model's own work. Three copies of one
  pattern agreed with each other, which is the dangerous state rather than
  the safe one: the day a model wrote `**FIX:**`, which is what a model does
  once it is allowed to use bold at all, one copy would have learned about it
  and the other two would not, and a corrected sentence would have been
  passed through byte for byte by the stream and then rendered as a paragraph
  with two asterisks in it.

  So the shape is decided here, once. A marker may be numbered, because
  models number their answers, and it may be wrapped in the markdown emphasis
  a model reaches for (`**FIX:**`, `*FIX*:`, `` `FIX:` ``), and the readers
  that need the payload get it with that wrapping already stripped.
*/

/** Emphasis a model puts round a marker: asterisks, underscores, backticks. */
const WRAP = "[*_`]*";

/**
 * A line that opens with a tagged marker, numbered or not, wrapped or not.
 *
 * Anchored at the start of the line so `The FIX: line below` is prose.
 */
export const TAGGED_LINE = new RegExp(`^(?:\\d+[.)]\\s*)?${WRAP}(?:VOCAB|FIX)${WRAP}\\s*:`, "i");

/** The `FIX:` marker itself, with anything wrapped round it. */
const FIX_MARKER = new RegExp(`^(?:\\d+[.)]\\s*)?${WRAP}FIX${WRAP}\\s*:${WRAP}\\s*`, "i");

/** The `VOCAB:` marker itself, with anything wrapped round it. */
const VOCAB_MARKER = new RegExp(`^(?:\\d+[.)]\\s*)?${WRAP}VOCAB${WRAP}\\s*:${WRAP}\\s*`, "i");

/**
 * Emphasis wrapped round a whole payload, which is the one edit this module
 * makes and the reason it is safe: `**Ma loen raamatut.**` and `Ma loen
 * raamatut.` are one sentence, and the asterisks are the model's typography
 * rather than Anu's Estonian. Nothing inside the payload is touched.
 */
function unwrap(text: string): string {
  return text.trim().replace(/^[*_`]+/, "").replace(/[*_`]+$/, "").trim();
}

/** The corrected sentence on a `FIX:` line, or null where the line is not one. */
export function fixFrom(line: string): string | null {
  const trimmed = line.trim();
  if (!FIX_MARKER.test(trimmed)) return null;
  return unwrap(trimmed.replace(FIX_MARKER, ""));
}

/** The word pair on a `VOCAB:` line, or null where the line is not one or has no pipe. */
export function vocabFrom(line: string): { et: string; en: string } | null {
  const trimmed = line.trim();
  if (!VOCAB_MARKER.test(trimmed)) return null;
  const payload = trimmed.replace(VOCAB_MARKER, "");
  const pipe = payload.indexOf("|");
  if (pipe === -1) return null;
  const et = unwrap(payload.slice(0, pipe));
  const en = unwrap(payload.slice(pipe + 1));
  if (!et || !en) return null;
  return { et, en };
}
