/*
  ANU'S PROSE, AFTER THE MODEL AND BEFORE THE LEARNER.

  Two rules the app states and the model only mostly follows.

  The first is punctuation. A dash used as a clause break is the loudest
  single tell that a sentence was generated rather than written, and this
  app's whole voice is a teacher explaining something to one person. The
  system prompt asks for none; a prompt is a request, and this is the pass
  that makes it true.

  The second is the stock opener. "It's important to note that" and "at the
  end of the day" carry no information at all, and a learner reading an
  explanation of the partitive should not have to walk past one to reach it.

  NEITHER LIST LIVES HERE ANY MORE. `lib/copy/voice.ts` is the one table of
  what gives a sentence away, and this file is the pass that applies the part
  of it a stream can safely apply. It used to hold its own copy, `prompt.ts`
  asked the model in different words again, and `readerCopy.test.ts` swept
  hand-written copy for a third list, so a phrase banned in Anu's answer was
  fine in the panel beside it and nobody could see that from any one file.

  WHAT IS DELIBERATELY NOT TOUCHED, AND WHY THAT IS THE WHOLE CARE HERE.

  Estonian. Never a word of it. Two lines in a reply are Estonian by
  construction, the `FIX:` line carrying a corrected sentence and every
  `VOCAB:` line, and both are passed through byte for byte. Rewriting
  punctuation inside a corrected sentence would change what Anu said the
  correction was, which is the one thing in this conversation a learner is
  meant to be able to trust, and a `VOCAB:` line is parsed on its pipe by
  `splitVocab` before it can become a flashcard. Anything this pass did to
  either would be the app editing Estonian, which is the rule the whole
  project is built around (ADR-005).

  Estonian quoted inside a paragraph is a different case and is safe: a
  paragraph rewrite only ever changes dash punctuation and drops an English
  opener, and neither can reach inside a word.
*/

import { EM_DASH as EM, EN_DASH as EN, OPENER_REWRITES } from "@/lib/copy/voice";
import { TAGGED_LINE } from "@/lib/tutor/markers";

/**
 * Lines that are Estonian by construction, and are never rewritten.
 *
 * Read from `lib/tutor/markers.ts` rather than spelled here, because three
 * modules recognize these lines and a model that is allowed bold writes
 * `**FIX:**` as readily as `FIX:`. A copy here that had not learned that
 * would rewrite a corrected sentence's punctuation while the UI still boxed
 * it, which is the exact fault this module's header is about.
 */
const ESTONIAN_LINE = TAGGED_LINE;

/**
 * The rewritable half of the voice table.
 *
 * Anchored patterns are openers and run first; the one unanchored pattern is
 * the "not just a rule, but a pattern" shape, which is rewritten wherever it
 * appears. Only phrases carrying no information get a rewrite at all: a
 * brochure word has no mechanical translation back into whatever was meant, so
 * the table detects those in hand-written copy and asks against them in the
 * prompt rather than putting words in Anu's mouth mid-sentence.
 */
const OPENERS: readonly [RegExp, string][] = OPENER_REWRITES;

/**
 * Dashes into punctuation a person would type.
 *
 * The order matters. A pair of them around an aside is one construction and
 * becomes two commas; a lone one before a capital is a sentence break and
 * becomes a full stop; everything else is a comma. A dash between two digits
 * is a range and becomes a hyphen, because a comma there would turn a span of
 * time into a list.
 */
function dashes(text: string): string {
  if (!text.includes(EM) && !text.includes(EN)) return text;

  let s = text;
  s = s.replace(new RegExp(`\\s*${EM}\\s*([^${EM}\\n]+?)\\s*${EM}\\s*`, "g"), ", $1, ");
  s = s.replace(new RegExp(`(\\d)\\s*[${EM}${EN}]\\s*(\\d)`, "g"), "$1-$2");
  s = s.replace(new RegExp(`\\s*${EM}\\s*(?=[A-ZÕÄÖÜŠŽ])`, "g"), ". ");
  s = s.replace(new RegExp(`\\s*[${EM}${EN}]\\s*`, "g"), ", ");

  // Tidy what the replacements left behind, without touching line breaks.
  s = s.replace(/,[ \t]*,+/g, ", ");
  s = s.replace(/\.[ \t]*\.+(?!\.)/g, ". ");
  s = s.replace(/[ \t]{2,}/g, " ");
  s = s.replace(/[ \t]+([.,;:!?])/g, "$1");
  return s;
}

/**
 * How many times the opener list is walked before giving up.
 *
 * Openers stack, and one pass only ever removes the outermost. "Great
 * question! It's important to note that the partitive marks an ongoing
 * action" came out of a single pass as "It's important to note that the
 * partitive marks an ongoing action", because the anchored pattern for the
 * second opener could not match until the first had gone and nothing ran
 * again afterwards. Two is the realistic depth and this allows four, since a
 * pass that changes nothing stops the loop anyway and the cost of the ceiling
 * is one wasted walk of a short list on the rare line that needed two.
 */
const OPENER_PASSES = 4;

function openers(text: string): string {
  let s = text;
  let ateLead = false;
  for (let pass = 0; pass < OPENER_PASSES; pass += 1) {
    const before = s;
    for (const [pattern, replacement] of OPENERS) {
      const next = s.replace(pattern, replacement);
      if (next !== s) {
        s = next;
        if (pattern.source.startsWith("^")) ateLead = true;
      }
    }
    if (s === before) break;
  }
  // Only recapitalise when an opener was actually removed. Doing it to every
  // line would capitalize a line that deliberately continues the one above.
  return ateLead && s ? s.replace(/^[a-zõäöü]/, (c) => c.toUpperCase()) : s;
}

/** One line of Anu's English, cleaned. Estonian lines pass straight through. */
export function humanizeLine(line: string): string {
  if (ESTONIAN_LINE.test(line.trim())) return line;
  return openers(dashes(line));
}

/** A whole reply, cleaned line by line. */
export function humanizeReply(text: string): string {
  return text.split("\n").map(humanizeLine).join("\n");
}

/*
  THE SAME PASS, OVER A REPLY THAT HAS NOT FINISHED ARRIVING.

  Anu streams, and a learner watching words appear is most of why the tutor
  feels like a person rather than a form submission. So this cannot simply
  buffer the whole answer and clean it at the end.

  It cannot naively clean each chunk either, because every rule here reads
  ahead. A chunk ending on a dash does not yet know whether the dash closes
  an aside, opens a sentence, or is just a comma, and a chunk carrying the
  first three words of a line does not yet know whether they are the start of
  a stock opener.

  So text is held back only where a rule could still change it, and released
  everywhere else. In ordinary prose, which is nearly all of it, nothing is
  held beyond the word currently being typed.

  THE STATE IS THE PART THAT MATTERS, AND IT IS WHAT THE FIRST VERSION GOT
  WRONG. Deciding "is this an Estonian line" by looking at the tail of the
  buffer works exactly until the first half of that line has already been
  shown, because what is left in the buffer no longer starts with `FIX:` and
  reads as ordinary prose. Measured on the test below: `FIX: Ma loen
  raamatut — see on huvitav.` came out of the stream as `FIX: Ma loen
  raamatut, see on huvitav.`, which is the app editing a corrected Estonian
  sentence, one chunk boundary at a time. So the answer is decided once, when
  a line opens, and carried until that line ends.
*/

/**
 * How far into a line an opener can reach.
 *
 * The longest pattern in the table is "it's important to note that " at 28
 * characters, and openers stack: "Great question! It's important to note
 * that" is two of them and 44. So this covers a chain of two with room, and
 * a third would have to arrive as prose. It is the price of the stream, paid
 * once at the start of each line: 64 characters held before the first word
 * appears, and nothing held after that beyond the word being typed.
 */
const LEAD = 64;

export class ProseStream {
  private held = "";
  /** How much of the line now being written has already been shown. */
  private emitted = 0;
  /** Whether that line is Estonian. Decided once, when the line opens. */
  private estonian = false;

  /** Text safe to show now, given everything seen so far. */
  push(chunk: string): string {
    this.held += chunk;
    return this.release(false);
  }

  /** Whatever is still held, once the model has stopped. */
  end(): string {
    return this.release(true);
  }

  private release(final: boolean): string {
    let out = "";

    // Completed lines first: a line that has ended can never change again.
    for (;;) {
      const newline = this.held.indexOf("\n");
      if (newline === -1) break;
      out += this.piece(this.held.slice(0, newline)) + "\n";
      this.held = this.held.slice(newline + 1);
      this.emitted = 0;
      this.estonian = false;
    }

    const cut = final ? this.held.length : this.partialCut();
    if (cut > 0) {
      out += this.piece(this.held.slice(0, cut));
      this.held = this.held.slice(cut);
    }
    if (final) {
      this.emitted = 0;
      this.estonian = false;
    }
    return out;
  }

  /**
   * Clean one piece of the line being written.
   *
   * The first piece of a line is where the line's character is settled and
   * where an opener can still be removed. Every piece after that is already
   * past both, so only the dash rules apply to it.
   */
  private piece(text: string): string {
    if (this.emitted === 0) {
      this.estonian = ESTONIAN_LINE.test(text.trimStart());
      this.emitted += text.length;
      return this.estonian ? text : openers(dashes(text));
    }
    this.emitted += text.length;
    return this.estonian ? text : dashes(text);
  }

  /** How much of the current partial line no remaining rule could still change. */
  private partialCut(): number {
    const line = this.held;
    const opening = this.emitted === 0;

    // The start of a line is where an opener lives, and where the line's
    // character is read. Hold it until the line is either long enough that
    // no opener could still be forming, or over.
    if (opening && line.length < LEAD) return 0;

    const estonian = opening ? ESTONIAN_LINE.test(line.trimStart()) : this.estonian;
    if (!estonian) {
      const unresolved = unresolvedIndex(line);
      if (unresolved !== -1) return unresolved;
    }

    // Never split a word: the reader would watch it appear in two halves.
    const space = line.search(/\s(?=\S*$)/);
    return space === -1 ? 0 : space + 1;
  }
}

/**
 * Where a rewrite could still start, or -1 if none could.
 *
 * A dash is settled once a second dash has arrived to close an aside, or
 * once enough follows it to tell a comma from a full stop. `not just` is the
 * same kind of construction read from the other end: it only becomes a
 * rewrite when its `but` turns up, so it waits for one.
 */
function unresolvedIndex(line: string): number {
  const candidates: number[] = [];

  const dash = line.search(new RegExp(`[${EM}${EN}]`));
  if (dash !== -1) {
    const after = line.slice(dash + 1);
    const settled = after.includes(EM) || after.includes(EN) || (/\S/.test(after) && after.length > 2);
    if (!settled) candidates.push(dash);
  }

  const shape = line.search(/\bnot just\b/i);
  if (shape !== -1 && !/\bnot just\s+[^,.;]+,\s+but\s/i.test(line.slice(shape))) {
    candidates.push(shape);
  }

  return candidates.length === 0 ? -1 : Math.min(...candidates);
}
