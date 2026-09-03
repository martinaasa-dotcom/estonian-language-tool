"use client";

import { Chip } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { splitOnForm } from "@/lib/dict/examples";
import { AI_TAG, SAME_SPELLING, sameSpelling } from "@/lib/copy/values";

/**
 * A WORD'S FIRST OUTING: WHAT IT MEANS, AND IT DOING ITS JOB IN A SENTENCE
 * SOMEBODY ACTUALLY WROTE.
 *
 * The sentence is the part that does the work. A gloss makes a word a label,
 * and a word in a sentence is a word you have seen behave. It is attested
 * Estonian picked by `teachingSentence`, with the form the learner is about to
 * be asked for marked in it, and nothing here is written or derived (ADR-005).
 *
 * One component rather than one per screen, and that is what it is for. Review
 * had this drawing and Learn needs the same one: two copies would be two
 * answers to how a word is introduced, and the one nobody was looking at would
 * be the one that stopped saying where its sentence came from.
 */
export function WordIntro({
  lemma, gloss, equivalent, sentence, isPhrase, autoplay = true, children,
}: {
  lemma: string;
  gloss: string;
  /** The Institute's own equivalent in the learner's chosen language, or null. */
  equivalent: { text: string; lang: string } | null;
  /** An attested sentence, and which form of the word it carries. */
  sentence: { et: string; en: string | null; form: string | null } | null;
  /** A whole utterance rather than a word, which is why it has no example. */
  isPhrase: boolean;
  autoplay?: boolean;
  /** Anything the screen wants under the sentence, such as what comes next. */
  children?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <p lang="et" className="text-3xl font-bold leading-tight tracking-tight md:text-4xl" style={{ color: "var(--ink)" }}>
          {lemma}
        </p>
        {/* Read aloud on arrival: the first time a word is met is the one time
            hearing it is worth more than reading it. */}
        <Speak text={lemma} autoplay={autoplay} />
      </div>
      {gloss && (
        <p className="text-base" style={{ color: "var(--ink-2)" }}>
          {sameSpelling(lemma, gloss) ? SAME_SPELLING : gloss}
        </p>
      )}
      {equivalent && (
        <p lang={equivalent.lang} className="text-base" style={{ color: "var(--ink-2)" }}>
          {equivalent.text}
        </p>
      )}

      <div className="my-1 h-1 w-14 rounded-full" style={{ background: "var(--accent-soft)" }} />

      {sentence ? (
        <div className="w-full max-w-md rounded-[var(--r)] px-4 py-3.5 text-left" style={{ background: "var(--raised)" }}>
          <div className="flex items-start gap-2">
            <p lang="et" className="flex-1 text-lg font-semibold leading-snug" style={{ color: "var(--ink)" }}>
              {splitOnForm(sentence.et, sentence.form).map((run, i) => (
                run.match
                  ? <mark key={i} className="bg-transparent font-bold" style={{ color: "var(--accent-deep)" }}>{run.text}</mark>
                  : <span key={i}>{run.text}</span>
              ))}
            </p>
            <Speak text={sentence.et} label="Hear the sentence" />
          </div>
          {sentence.en && (
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
              {sentence.en}
              <Chip tone="again">{AI_TAG}</Chip>
            </p>
          )}
          <p className="mt-2 text-2xs" style={{ color: "var(--ink-3)" }}>
            A real sentence, from Ekilex. Try reading it out loud.
          </p>
        </div>
      ) : (
        /* No sentence, said plainly. The dictionary carries examples for most
           words and not for all of them, and a screen that quietly shows a word
           on its own looks exactly like one that had nothing to say about it.

           AND A PHRASE IS NOT AN ABSENCE. Ekilex records a usage against a
           word, so it has none for `Tere!` or `Kuidas läheb?` and never will:
           those are already the sentence. Every one of the twenty phrases the
           A1 greetings unit teaches used to read as a gap in the dictionary,
           on the first cards anybody meets. */
        <p className="max-w-[38ch] text-sm" style={{ color: "var(--ink-3)" }}>
          {isPhrase
            ? "A whole phrase, said just as it stands. Say it out loud a couple of times."
            : "No example sentence for this one yet. Say it out loud a couple of times."}
        </p>
      )}

      {children}
    </>
  );
}
