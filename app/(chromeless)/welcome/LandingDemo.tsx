"use client";

import { useState } from "react";
import { CASES } from "@/lib/estonian/cases";
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
  /** Every spelling worth printing, joined the way `acceptedAnswers` splits. */
  singular: string | null;
  plural: string | null;
  /** One of the three principal parts, which the left column already shows. */
  principal: boolean;
  /**
   * The printed form is not the genitive stem with the case's ending on it,
   * so no rule reaches it and the dictionary holds it: `tuppa` and `kätte`.
   * The row says so in words, because a lit ending would be lighting a rule
   * the word does not follow.
   */
  stored: boolean;
}

export interface DemoWord {
  lemma: string;
  genitive: string | null;
  /** Principal parts: the forms that genuinely have to be memorised. */
  principal: { label: string; value: string }[];
  cases: DemoCase[];
}

/**
 * Learn three forms and get most of the rest: the single most encouraging fact
 * about Estonian nouns, shown rather than claimed. Every form on the right is
 * produced by the same function the app itself uses, which takes the form the
 * dictionary attests wherever there is one and applies the regular ending only
 * where there is not. Nothing here was written by hand or by a model.
 *
 * THE CARD IS THE SAME SHAPE FOR EVERY WORD, and that is a decision this card
 * used to make the other way. It promoted a stored short illative into the
 * left column, so pressing `tuba` read four and ten where `raamat` read three
 * and eleven: the left column grew a row, the right one lost one and closed
 * up, and the whole card changed height under the reader's pointer. That was
 * honest about the language and wrong about the card, because a table that
 * reshapes itself on every press reads as a table that cannot decide what it
 * is, and the four letters hanging off its edges are placed against a height.
 *
 * So the left column is always the three principal parts, and the right one
 * is always the eleven other cases in the order every schoolbook lists them,
 * with the sisseütlev first and on a row of its own across both columns. It is
 * the one case Estonian has two answers for, and the one that sometimes has to
 * be learnt rather than worked out, so its row is where that is said: `tuppa`
 * beside `toasse`, and a chip saying this one is learnt. Every other word puts
 * `raamatusse` there with its ending lit, and the row is the same height
 * either way. Six rows on the right, three on the left, at every word.
 *
 * `counted` still counts rather than types the two headings, because a
 * dictionary entry can be missing a partitive and the heading has to be true
 * of the rows under it.
 */
export function CaseExplorer({ words }: { words: DemoWord[] }) {
  const [active, setActive] = useState(0);
  const word = words[active] ?? words[0];
  if (!word) return null;

  const derived = word.cases.filter((c) => !c.principal);
  const illative = derived.find((c) => c.et === "sisseütlev");
  const rest = derived.filter((c) => c !== illative);

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
            className={`press rounded-full px-3.5 py-1.5 text-base transition-ui ${active === n ? "chip-spring" : "tap-tint"}`}
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
          two answers. Three rows grown to the height of eleven are three rows
          worth looking at, which is the claim: these are the ones you have to
          hold in your head, and they are bigger on the page for the same
          reason they are shorter in number. And because the right column is
          six rows for every word, the three on the left are the same height
          for every word too.

          THE VALUES SETTLE IN PLACE. Pressing a chip used to fade the whole
          list up from fourteen pixels below, which on a card whose rows are
          the same for every word is the rows appearing to drop and land. Now
          each row keeps its box and only the word inside it changes, arriving
          in a short stagger down the column, so what the eye follows is the
          forms changing and not the table moving.
        */}
        <div className="flex flex-col">
          <p className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>
            The {counted(word.principal.length)} cases you learn
          </p>
          <div className="flex flex-1 flex-col gap-2">
            {word.principal.map((p, n) => (
              <div
                key={p.label}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-[var(--r)] px-4 py-2.5"
                style={{ background: "var(--raised)" }}
              >
                <span lang="et" className="text-xs" style={{ color: "var(--ink-3)" }}>{p.label}</span>
                <span
                  key={`${word.lemma}-${p.label}`}
                  lang="et"
                  className="settle text-lg font-bold"
                  style={{ color: "var(--ink)", "--i": n } as React.CSSProperties}
                >
                  {p.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          {/*
            "that follow the pattern" was a claim about all eleven, and the
            illative does not: `tuba` gives `tuppa`, which no ending on `toa`
            produces. The heading says what the column is rather than making a
            promise the row under it breaks; the row is where the exception is
            named.
          */}
          <p className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>
            The {counted(derived.length)} that come with them
          </p>
          <ul className="grid grid-cols-2 gap-1.5">
            {illative && (
              <CaseRow key={`${word.lemma}-${illative.et}`} c={illative} index={0} wide />
            )}
            {rest.map((c, n) => (
              <CaseRow key={`${word.lemma}-${c.et}`} c={c} index={n + 1} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * One case, on one row, the same height whatever is in it.
 *
 * THE LABEL SITS OVER THE FORM UNTIL THERE IS ROOM BESIDE IT. Measured with
 * the label and the form on one line at every width: the card was 408px tall
 * for every word at 1280, and at 390 it was 750px for `raamat` against 660
 * for `mees`, because `kaasaütlev raamatuga` is the one pair in the five
 * words that will not fit a half-width cell on a phone and so wrapped. That
 * is the jump this whole card was rebuilt to remove, arriving through the
 * text rather than the row count. So below `lg` each cell is two lines by
 * construction, the case over the form, and above it the two go back on one
 * line where a cell is 230px and the longest pair needs 150.
 *
 * The chip on a stored illative is inline and small, so a word that carries
 * one and a word that does not draw the row at the same height; it is the
 * only thing on the card that changes between words other than the forms.
 */
function CaseRow({ c, index, wide = false }: { c: DemoCase; index: number; wide?: boolean }) {
  return (
    <li
      className={`ending-row settle flex min-w-0 flex-col items-start gap-x-2 gap-y-0.5 rounded-[var(--r-sm)] px-3 py-2 lg:flex-row lg:items-baseline lg:justify-between ${wide ? "col-span-2" : ""}`}
      style={{ background: "var(--accent-soft)", "--i": index } as React.CSSProperties}
    >
      {/* No opacity: `--accent-deep` on `--accent-soft` is 5.16, and three
          quarters of it is 3.25. This is the Estonian name of the case,
          which is the label this app leads with everywhere else. */}
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span lang="et" className="text-2xs" style={{ color: "var(--accent-deep)" }}>{c.et}</span>
        {c.stored && (
          <span
            className="whitespace-nowrap rounded-full px-1.5 text-2xs font-semibold leading-4"
            style={{ background: "var(--surface)", color: "var(--accent-deep)" }}
          >
            learn this one too
          </span>
        )}
      </span>
      <span lang="et" className="text-base font-semibold" style={{ color: "var(--accent-deep)" }}>
        <WithEnding form={c.singular} et={c.et} />
      </span>
    </li>
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

/**
 * A derived form with its ending lit, which is the whole argument of the card
 * made visible: the eleven on the right are the stem on the left plus a few
 * letters, and hovering a row lifts exactly those letters. The ending is read
 * off the case table rather than guessed, and a form that does not end in
 * its case's suffix (the short illative `tuppa`) is left whole, because
 * lighting the wrong letters would teach the wrong rule.
 */
function WithEnding({ form, et }: { form: string | null; et: string }) {
  if (!form) return null;
  const suffix = CASES.find((c) => c.et === et)?.suffix;
  /*
    A pair is two spellings and each is lit on its own: `tuppa` is left whole
    because nothing on it is an ending, and `toasse` beside it gets its `sse`.
    Lighting the joined string would underline the last three letters of the
    pair and say nothing about the first.
  */
  const parts = form.split(" / ");
  return (
    <>
      {parts.map((part, n) => (
        <span key={part}>
          {n > 0 && <span style={{ color: "var(--ink-3)" }}> / </span>}
          {!suffix || !part.endsWith(suffix) || part.length <= suffix.length ? part : (
            <>
              {part.slice(0, -suffix.length)}
              <span className="ending">{suffix}</span>
            </>
          )}
        </span>
      ))}
    </>
  );
}
