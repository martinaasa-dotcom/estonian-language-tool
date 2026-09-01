"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

/**
 * How many, in words, because the two headings inside the card are prose and
 * the rest of this page counts in words rather than digits.
 *
 * They are counted rather than typed. "Three" and "eleven" are true of the
 * nouns the explorer can show today and neither is a fact about Estonian: a
 * dictionary entry missing its partitive has two principal parts, and how many
 * regular cases can be derived depends on which stems came back with the word.
 * A heading promising eleven over a list of nine is the card arguing with
 * itself in the one place the whole page is asking to be believed.
 */
const COUNTED = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen"] as const;
const counted = (n: number): string => COUNTED[n] ?? String(n);

export interface DemoCase {
  en: string;
  et: string;
  question: string;
  singular: string | null;
  plural: string | null;
  principal: boolean;
}

export interface DemoWord {
  lemma: string;
  genitive: string | null;
  /** Principal parts: the forms that genuinely have to be memorised. */
  principal: { label: string; value: string }[];
  cases: DemoCase[];
}

/**
 * Learn three forms and the rest follows: the single most encouraging fact
 * about Estonian nouns, shown rather than claimed. Every form on the right is
 * derived by the same function the app itself uses, from principal parts a
 * dictionary recorded. Nothing here was written by hand or by a model.
 *
 * SOMETIMES IT IS FOUR, and the card says so by counting. `tuppa` and `kätte`
 * are not the genitive stem with an ending on it and no rule reaches either,
 * so they are stored, and a word that has one puts it on the left with the
 * forms you memorise. The two headings count what is under them, which is what
 * the note above them has always said they do, so pressing `tuba` reads four
 * and ten where `raamat` reads three and eleven. The alternative is printing
 * `toasse`, which is defensible Estonian and a sentence nobody says.
 */
export function CaseExplorer({ words }: { words: DemoWord[] }) {
  const [active, setActive] = useState(0);
  const word = words[active] ?? words[0];
  if (!word) return null;

  const derived = word.cases.filter((c) => !c.principal && c.singular);

  return (
    <div
      className="overflow-hidden rounded-[var(--r-xl)] border"
      style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow)" }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b px-5 py-4" style={{ borderColor: "var(--rule-soft)" }}>
        <span className="label-xs mr-1" style={{ color: "var(--ink-3)" }}>Try a word</span>
        {words.map((w, n) => (
          <button
            key={w.lemma}
            type="button"
            onClick={() => setActive(n)}
            aria-pressed={active === n}
            lang="et"
            className="press rounded-full px-3.5 py-1.5 text-base transition-ui"
            style={{
              background: active === n ? "var(--accent-deep)" : "var(--raised)",
              color: active === n ? "var(--accent-ink)" : "var(--ink-2)",
              fontWeight: active === n ? 700 : 500,
            }}
          >
            {w.lemma}
          </button>
        ))}
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:p-6">
        {/*
          The two headings say what each column is, which is what they were for
          and not what they said.

          "What you memorise" and "What you get for free" were a pair of jokes
          at the reader's expense: the left one names a chore before naming the
          thing, and the right one offers as a gift the one thing every other
          Estonian dictionary also gives away. Neither says what is in the
          column under it. These name the cases and say where each set comes
          from, which is the whole argument of the section standing over them.
        */}
        {/*
          THE THREE FILL THE HEIGHT THE ELEVEN SET.

          Two lists of very different lengths in two columns leaves the shorter
          one ending a third of the way down, and the card then reads as having
          lost something out of its bottom left corner rather than as holding
          two answers. The note that used to sit in that space said in a
          sentence what the two headings now say in four words each, so filling
          it back up with words would be putting the sentence back.

          What fills it instead is the thing the column is about. Three rows
          grown to the height of eleven are three rows worth looking at, which
          is the claim: these are the ones you have to hold in your head, and
          they are bigger on the page for the same reason they are shorter in
          number. Centred rather than baselined once they have room, because a
          baseline is a way of lining two runs of text up in a box that fits
          them and reads as text stuck to the top of one that does not.
        */}
        <div className="flex flex-col">
          <p className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>
            The {counted(word.principal.length)} cases you learn
          </p>
          <div className="flex flex-1 flex-col gap-2">
            {word.principal.map((p) => (
              <div
                key={p.label}
                className="flex flex-1 items-center justify-between gap-3 rounded-[var(--r)] px-4 py-2.5"
                style={{ background: "var(--raised)" }}
              >
                <span lang="et" className="text-xs" style={{ color: "var(--ink-3)" }}>{p.label}</span>
                <span lang="et" className="text-lg font-bold" style={{ color: "var(--ink)" }}>{p.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>
            The {counted(derived.length)} that follow the pattern
          </p>
          <ul key={word.lemma} className="fade-up grid grid-cols-2 gap-1.5">
            {derived.map((c) => (
              <li
                key={c.et}
                className="flex items-baseline justify-between gap-2 rounded-[var(--r-sm)] px-3 py-2"
                style={{ background: "var(--accent-soft)" }}
              >
                {/* No opacity: `--accent-deep` on `--accent-soft` is 5.16, and three
                    quarters of it is 3.25. This is the Estonian name of the case,
                    which is the label this app leads with everywhere else. */}
                <span lang="et" className="text-2xs" style={{ color: "var(--accent-deep)" }}>{c.et}</span>
                <span lang="et" className="text-base font-semibold" style={{ color: "var(--accent-deep)" }}>
                  {c.singular}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** The tutor, answering one real question, typed out on demand. */
export function TutorPeek() {
  const [asked, setAsked] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="ml-auto max-w-[85%] rounded-[var(--r-lg)] rounded-br-md px-4 py-3 text-sm"
        style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
      >
        Why is it <span lang="et" className="font-semibold">raamatut</span> and not{" "}
        <span lang="et" className="font-semibold">raamatu</span>?
      </div>

      {asked ? (
        <div
          className="fade-up max-w-[92%] rounded-[var(--r-lg)] rounded-bl-md border px-4 py-3 text-sm leading-relaxed"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", color: "var(--ink-2)" }}
        >
          <span className="label-xs mb-1.5 block" style={{ color: "var(--blush-ink)" }}>Anu</span>
          Because the action is not finished yet. <span lang="et" className="font-semibold">Ma loen raamatut</span>{" "}
          means “I am reading a book”: partitive, so it is still going. Swap in the genitive and you get{" "}
          <span lang="et" className="font-semibold">Ma loen raamatu läbi</span>, a whole book,
          finished. In Estonian, the case of the object is what tells you whether the action is done.
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAsked(true)}
          className="press mr-auto flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-ui hover:-translate-y-px"
          style={{ background: "var(--surface)", borderColor: "var(--rule)", color: "var(--ink-2)" }}
        >
          Ask Anu <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
