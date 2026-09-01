"use client";

import { useEffect, useState } from "react";
import { Check, Ear, X } from "lucide-react";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Speak } from "@/components/Speak";
import { Chip, Note } from "@/components/ui";
import { BLANK } from "@/lib/estonian/cloze";
import { gradeChoice, gradeDictation, gradeWrite } from "@/lib/assessment/score";
import type { ChoiceItem, DictationItem, Item, SpeakItem, WriteItem } from "@/lib/assessment/types";
import type { WordStatus } from "@/lib/estonian/dictation";

/**
 * One question, and its answer.
 *
 * Each kind reports the same thing back: a credit between 0 and 1, and, for
 * speaking, the learner's own rating instead. Nothing here decides a level; the
 * pure marking functions in `lib/assessment/score.ts` do the marking and
 * `placement()` does the rest, so what a learner sees on screen and what the
 * result is built from cannot drift apart.
 *
 * Feedback is shown after every answer, including the wrong ones, with the
 * reason. A placement check that withholds the answers is fifteen minutes spent
 * learning nothing, and the learner has already agreed to be tested.
 */

export interface Answer {
  credit: number;
  selfRating?: number;
  skipped?: boolean;
}

const WORD_TONE: Record<WordStatus, { background: string; color: string; title: string }> = {
  right: { background: "var(--good-soft)", color: "var(--good-ink)", title: "Exactly right" },
  diacritics: { background: "var(--hard-soft)", color: "var(--hard-ink)", title: "The right word, without its Estonian letters" },
  typo: { background: "var(--hard-soft)", color: "var(--hard-ink)", title: "One keystroke out" },
  wrong: { background: "var(--again-soft)", color: "var(--again-ink)", title: "A different word" },
  missing: { background: "var(--again-soft)", color: "var(--again-ink)", title: "Left out" },
  extra: { background: "var(--raised)", color: "var(--ink-3)", title: "Not in the sentence" },
};

/**
 * The provenance line. Every Estonian string on screen says where it is from.
 *
 * "From the dictionary" was true and told a learner nothing: whose dictionary,
 * and why should they believe it over the teacher who told them `kallis` also
 * means dear? Both sources are named, because they are the two this app is
 * built on and neither is ours. Ekilex is the Institute of the Estonian
 * Language's own database, which is the authority a class would cite, and the
 * English glosses come from Wiktionary. A source a reader can go and check is
 * the difference between a claim and a citation.
 */
const SOURCE_LABEL: Record<Item["source"], string> = {
  dictionary: "From Kodukeel's dictionary, built from Ekilex and Wiktionary",
  ekilex: "A form from Ekilex, the Institute of the Estonian Language's database",
  derived: "Worked out from the genitive stem, by rule rather than by guess",
  usage: "A sentence recorded by a lexicographer, from Ekilex",
};

/**
 * A sentence with a hole in it, or a plain one.
 *
 * The blank is drawn rather than spelled, because four underscores in the
 * middle of a line of Estonian read as a rendering fault. It is the one place
 * on these screens where the accent is carrying meaning rather than decorating,
 * so it says what it is to a screen reader too: the run is announced as "blank"
 * instead of as whatever four underscores are pronounced as.
 *
 * A whole sentence is set smaller than a single word. Both used to be `3xl`,
 * which is right for `aken` on its own and is most of a phone screen for a
 * sentence.
 */
export function EstonianPrompt({ text }: { text: string }) {
  const parts = text.split(BLANK);
  const size = text.includes(" ") ? "text-2xl" : "text-3xl";
  return (
    <p lang="et" className={`mt-5 ${size} font-bold leading-snug`} style={{ color: "var(--ink)" }}>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && (
            <span
              className="mx-0.5 inline-block rounded-[var(--r-sm)] px-3 align-baseline"
              style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            >
              <span className="sr-only">blank</span>
              <span aria-hidden>&nbsp;&nbsp;&nbsp;</span>
            </span>
          )}
          {part}
        </span>
      ))}
    </p>
  );
}

export function Provenance({ source }: { source: Item["source"] }) {
  return (
    <p className="mt-4 text-xs" style={{ color: "var(--ink-3)" }}>
      {SOURCE_LABEL[source]}. No Estonian on this screen was written by this app or by an AI.
    </p>
  );
}

// ── Multiple choice, read or heard ───────────────────────────────────────────

export function ChoiceQuestion({ item, onAnswer, onNoAudio }: {
  item: ChoiceItem;
  onAnswer: (answer: Answer) => void;
  /** Called when the audio a heard question depends on cannot be produced. */
  onNoAudio: () => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [played, setPlayed] = useState(!item.heard);
  const [silent, setSilent] = useState(false);

  useEffect(() => {
    setPicked(null);
    setPlayed(!item.heard);
    setSilent(false);
  }, [item.id, item.heard]);

  useEffect(() => {
    if (picked !== null || !played) return;
    const onKey = (event: KeyboardEvent) => {
      const n = Number(event.key);
      if (Number.isInteger(n) && n >= 1 && n <= item.options.length) choose(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const choose = (index: number) => {
    if (picked !== null) return;
    setPicked(index);
  };

  const right = picked === item.answer;

  return (
    <div>
      <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.question}</p>

      {item.heard ? (
        /*
          A click anywhere in this group counts as having played it, which is
          what unlocks the options. The alternative was a separate "I have
          played it" button, and a learner who does not notice it is a learner
          staring at four options they cannot press.
        */
        <div className="mt-5 flex flex-wrap items-center gap-3" onClick={() => setPlayed(true)}>
          <Speak
            text={item.et}
            label="Play the Estonian"
            size={26}
            className="flex h-16 w-16 items-center justify-center rounded-full"
            style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            onUnavailable={() => { setSilent(true); onNoAudio(); }}
          />
          <Speak
            text={item.et}
            slow
            label="Play it slowly"
            size={18}
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "var(--raised)", color: "var(--ink-2)" }}
            onUnavailable={() => { setSilent(true); onNoAudio(); }}
          />
          <span className="text-sm" style={{ color: "var(--ink-3)" }}>
            {played ? "Pick the meaning" : "Play it, then pick the meaning"}
          </span>
        </div>
      ) : item.et ? (
        <EstonianPrompt text={item.et} />
      ) : null}

      {silent && (
        <div className="mt-4">
          <Note tone="sky">
            The audio could not be made. That is a problem here, not an answer about your
            listening, so this section stays unmeasured instead of being marked at zero.
          </Note>
        </div>
      )}

      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {item.options.map((option, index) => {
          const chosen = picked === index;
          const correct = picked !== null && index === item.answer;
          const wrong = chosen && !correct;
          return (
            <button
              key={option}
              type="button"
              disabled={picked !== null || !played}
              onClick={() => choose(index)}
              className="choice-btn flex min-h-[52px] items-center gap-3 rounded-[var(--r-lg)] border px-4 py-3 text-left disabled:cursor-default"
              style={{
                ...(correct || wrong ? {
                  borderColor: correct ? "var(--good-ink)" : "var(--again-ink)",
                  background: correct ? "var(--good-soft)" : "var(--again-soft)",
                } : {}),
                opacity: picked !== null && !chosen && !correct ? 0.55 : 1,
              }}
            >
              <span
                className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: "var(--raised)", color: "var(--ink-3)" }}
              >
                {index + 1}
              </span>
              <span
                lang={item.estonianOptions ? "et" : undefined}
                className={`min-w-0 flex-1 text-base ${item.estonianOptions ? "font-semibold" : ""}`}
                style={{ color: "var(--ink)" }}
              >
                {option}
              </span>
              {correct && <Check size={17} aria-hidden style={{ color: "var(--good-ink)" }} />}
              {wrong && <X size={17} aria-hidden style={{ color: "var(--again-ink)" }} />}
            </button>
          );
        })}
      </div>

      {picked !== null && (
        <div className="pop-in mt-5">
          <Chip tone={right ? "good" : "again"}>{right ? "Right" : "Not this time"}</Chip>
          {/*
            Not marked lang="et": this line is English prose with an Estonian
            word or two inside it, and telling a screen reader the whole
            sentence is Estonian would have it read the English with Estonian
            phonics, which is worse than leaving the two words unmarked.
          */}
          <p className="mt-3 text-base" style={{ color: "var(--ink-2)" }}>{item.because}</p>
          <Provenance source={item.source} />
          <Button
            variant="primary"
            size="lg"
            className="mt-5"
            autoFocus
            onClick={() => onAnswer({ credit: gradeChoice(item, picked) })}
          >
            Next question
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Dictation ────────────────────────────────────────────────────────────────

export function DictationQuestion({ item, onAnswer, onNoAudio }: {
  item: DictationItem;
  onAnswer: (answer: Answer) => void;
  onNoAudio: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [mark, setMark] = useState<ReturnType<typeof gradeDictation> | null>(null);
  const [silent, setSilent] = useState(false);

  useEffect(() => { setTyped(""); setMark(null); setSilent(false); }, [item.id]);

  return (
    <div>
      <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.question}</p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Speak
          text={item.et}
          label="Play the sentence"
          size={26}
          className="flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
          onUnavailable={() => { setSilent(true); onNoAudio(); }}
        />
        <Speak
          text={item.et}
          slow
          label="Play it slowly"
          size={18}
          className="flex h-12 w-12 items-center justify-center rounded-full"
          style={{ background: "var(--raised)", color: "var(--ink-2)" }}
          onUnavailable={() => { setSilent(true); onNoAudio(); }}
        />
        <span className="text-sm" style={{ color: "var(--ink-3)" }}>
          <Ear size={14} className="mr-1.5 inline" aria-hidden />
          As many times as you like
        </span>
      </div>

      {silent && (
        <div className="mt-4">
          <Note tone="sky">
            No audio, so there is nothing to write down. Skip this one, and the listening section
            stays unmeasured instead of being marked at zero.
          </Note>
        </div>
      )}

      {mark === null ? (
        <div className="mt-6">
          <EstonianInput
            value={typed}
            onChange={setTyped}
            ariaLabel="What you heard"
            placeholder="Write the sentence"
            large
            autoFocus
            onEnter={() => setMark(gradeDictation(item, typed))}
          />
          {/*
            No "skip this one". A placement check is fifteen questions for a
            beginner and every one of them is load bearing, so a skip is a hole
            under the number rather than a blank in the report. Leaving the box
            empty and pressing Check is still available and is honest: it marks
            nothing wrong that was not, and it counts.
          */}
          <div className="mt-4">
            <Button variant="primary" size="lg" onClick={() => setMark(gradeDictation(item, typed))}>
              Check
            </Button>
          </div>
        </div>
      ) : (
        <div className="pop-in mt-6">
          <Chip tone={mark.result.verdict === "correct" ? "good" : mark.result.verdict === "wrong" ? "again" : "hard"}>
            {mark.result.note}
          </Chip>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {mark.result.words.map((word, i) => {
              const tone = WORD_TONE[word.status];
              return (
                <span
                  key={`${word.expected ?? word.typed ?? ""}-${i}`}
                  lang="et"
                  title={tone.title}
                  className="rounded-[var(--r-sm)] px-2 py-1 text-base"
                  style={{ background: tone.background, color: tone.color }}
                >
                  {word.expected ?? word.typed}
                </span>
              );
            })}
          </div>
          <p lang="et" className="mt-4 text-base" style={{ color: "var(--ink-2)" }}>{item.et}</p>
          <Provenance source={item.source} />
          <Button variant="primary" size="lg" className="mt-5" autoFocus onClick={() => onAnswer({ credit: mark.credit })}>
            Next question
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Writing ──────────────────────────────────────────────────────────────────

export function WriteQuestion({ item, onAnswer }: { item: WriteItem; onAnswer: (answer: Answer) => void }) {
  const [text, setText] = useState("");
  const [mark, setMark] = useState<ReturnType<typeof gradeWrite> | null>(null);

  useEffect(() => { setText(""); setMark(null); }, [item.id]);

  return (
    <div>
      <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.question}</p>
      {/*
        The word and what it means, with the gap between them drawn rather than
        typed. A bold Estonian word butted up against the English after it read
        as one run ("kaartmeans map, card") on the screen this was reported
        from, because a single space between two spans at two weights is not a
        gap anybody can see. `gap-2` is a gap the layout owns.
      */}
      <p className="mt-2 flex flex-wrap items-baseline gap-2 text-lg" style={{ color: "var(--ink-2)" }}>
        <span lang="et" className="font-bold" style={{ color: "var(--ink)" }}>{item.lemma}</span>
        <span className="text-base" style={{ color: "var(--ink-3)" }}>means {item.translation}</span>
      </p>

      <EstonianPrompt text={item.sentence} />

      {mark === null ? (
        <div className="mt-6">
          <EstonianInput
            value={text}
            onChange={setText}
            ariaLabel="The missing word"
            placeholder="One word"
            large
            autoFocus
            onEnter={() => setMark(gradeWrite(item, text))}
          />
          <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
            Checked directly against the word a lexicographer put in this sentence, so no AI is
            involved, and none is needed.
          </p>
          <div className="mt-4">
            <Button variant="primary" size="lg" onClick={() => setMark(gradeWrite(item, text))}>
              Check
            </Button>
          </div>
        </div>
      ) : (
        <div className="pop-in mt-6">
          <Chip tone={mark.credit === 1 ? "good" : mark.credit > 0 ? "hard" : "again"}>{mark.note}</Chip>
          {/*
            The sentence put back together, and then why it wanted that word.
            The sentence alone answers "what was it", which a learner who has
            just been marked wrong can already see from the mark. What they
            asked for is why `kaardilt` and not `kaart`, and that is the same
            explanation the multiple choice version of this task prints, from
            the same function, so the two cannot say different things.
          */}
          <p lang="et" className="mt-4 text-xl font-bold leading-snug" style={{ color: "var(--ink)" }}>
            {item.full}
          </p>
          {mark.credit < 1 && (
            <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.because}</p>
          )}
          <Provenance source={item.source} />
          <Button variant="primary" size="lg" className="mt-5" autoFocus onClick={() => onAnswer({ credit: mark.credit })}>
            Next question
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Speaking ─────────────────────────────────────────────────────────────────

/**
 * How sure somebody feels about saying it, which is all this can honestly ask.
 *
 * These used to be four judgements of a recording ("Nothing like it", "A
 * native would work out what I meant") because the screen recorded the learner
 * and played it back beside a native voice for comparison. The recorder is
 * gone, so the wording is too: a scale about a recording nobody made is a
 * question with nothing behind it. What is left is the learner's own
 * confidence, which is what the result already reports it as.
 */
const SELF_RATINGS = [
  { value: 1, label: "Not at all", detail: "I would not attempt this out loud." },
  { value: 2, label: "Hesitant", detail: "I could get it out, slowly and with mistakes." },
  { value: 3, label: "Fairly sure", detail: "I would say it and expect to be understood." },
  { value: 4, label: "Confident", detail: "I would say this to somebody without thinking about it." },
] as const;

/**
 * Speaking, judged by the only person qualified to judge it here.
 *
 * There is no verified Estonian speech recogniser available to this app
 * (ADR-018), so nothing scores anything: `scripts/measure-asr.mjs` puts the
 * best reachable one at a 14.6% word error rate on clean native audio, with
 * its mistakes landing on consonant length and word boundaries, which is
 * exactly where an Estonian learner is weakest. A transcript like that would
 * report correct pronunciation as an error four times in five.
 *
 * **So the recorder is gone.** It was there so a learner could play their own
 * attempt beside a native rendering and compare, which sounds useful and was
 * not: the two clips play one after the other rather than together, nobody
 * hears their own accent the way somebody else does, and the app was asking
 * for a microphone permission and a recording in exchange for a rating it then
 * threw away for scoring purposes anyway. What is left is the honest version
 * of the same question. Hear it said properly, and say how confident you are
 * that you could say it. That answer is reported back as the learner's own and
 * contributes nothing to the level, which the screen says out loud.
 */
export function SpeakQuestion({ item, onAnswer }: { item: SpeakItem; onAnswer: (answer: Answer) => void }) {
  return (
    <div>
      <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{item.question}</p>
      <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>{item.translation}</p>

      <p lang="et" className="mt-5 text-3xl font-bold leading-snug" style={{ color: "var(--ink)" }}>
        {item.et}
      </p>

      <div className="mt-5">
        <Speak
          text={item.et}
          label="Hear a native voice say it"
          size={20}
          className="flex min-h-[44px] items-center gap-2 rounded-full px-4"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        />
      </div>

      <Note tone="neutral">
        Nothing here can grade how you say it. The speech recognisers we tested get Estonian
        consonant length and word boundaries wrong often enough that they would mark good
        pronunciation as a mistake, and being told you are wrong when you are right is worse than
        being told nothing. Until that changes, this part asks you instead. Your answer is recorded
        as yours, and it never moves your level.
      </Note>

      <p className="mt-5 text-base font-semibold" style={{ color: "var(--ink)" }}>
        How confident are you saying this out loud?
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {SELF_RATINGS.map((rating) => (
          <button
            key={rating.value}
            type="button"
            onClick={() => onAnswer({ credit: 0, selfRating: rating.value })}
            className="choice-btn min-h-[52px] rounded-[var(--r-lg)] border px-4 py-3 text-left"
          >
            <span className="block text-base font-medium" style={{ color: "var(--ink)" }}>{rating.label}</span>
            <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{rating.detail}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
