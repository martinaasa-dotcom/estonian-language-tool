"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, Headphones, Mic, PenLine, WifiOff } from "lucide-react";
import { recordAssessment } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Mascot } from "@/components/brand";
import { Card, Chip, Meter, Note, SectionTitle } from "@/components/ui";
import { placement } from "@/lib/assessment/score";
import { nextCursor, progress } from "@/lib/assessment/session";
import type { Item, ItemRef, Placement, Response, Skill } from "@/lib/assessment/types";
import { ChoiceQuestion, DictationQuestion, SpeakQuestion, WriteQuestion, type Answer } from "./Question";
import { ResultPanel } from "./ResultPanel";

/**
 * Sitting the check.
 *
 * The paper arrives built (`lib/progress/assessment.ts` reads the dictionary,
 * `lib/assessment/items.ts` shapes it) and is snapshotted on mount, so a
 * refresh of the page underneath cannot swap a question out while it is being
 * read. Which question comes next is decided by `nextCursor`, which is a pure
 * function of the paper and the answers so far: once a whole band has come in
 * under half, the harder questions in that skill are dropped rather than asked.
 *
 * Two things it deliberately does not do. It does not grade any card, because
 * the words in it are chosen for *not* being in the learner's deck and grading
 * them would write scheduling history for cards that do not exist. And it does
 * not score the speaking section, because nothing in this app may.
 */

const SECTIONS: Record<Skill, { icon: typeof Compass; title: string; body: string }> = {
  reading: {
    icon: Compass,
    title: "Reading",
    body:
      "What a word means, and which form a sentence needs. The sentences are ones a lexicographer " +
      "recorded, with a word taken out of them, which is the task the state examination calls a " +
      "lünkülesanne. Nothing here was written for the test.",
  },
  listening: {
    icon: Headphones,
    title: "Listening",
    body:
      "Estonian audio with nothing written down: single words, then whole sentences at speed. If the " +
      "audio will not play, say so and this section is left unmeasured rather than counted as a " +
      "failure, because a silent speaker is not a fact about your listening.",
  },
  writing: {
    icon: PenLine,
    title: "Writing",
    body:
      "A sentence with a word missing, and you type the form it needs. It is marked against the word " +
      "a lexicographer actually wrote there, by string comparison, so the verdict is certain and no " +
      "AI reads your answer.",
  },
  speaking: {
    icon: Mic,
    title: "Speaking",
    body:
      "This one cannot be scored, and it is not going to pretend otherwise. There is no verified " +
      "Estonian speech recogniser available here, so you will hear a native voice, record yourself, " +
      "compare the two and rate it. Your rating is reported as yours and never moves your level.",
  },
};

export function AssessmentRunner({ items: initialItems, missing, onFinish }: {
  items: Item[];
  /** Sections the dictionary could not fill, named rather than hidden. */
  missing: string[];
  /** Set by the first-run wizard, which shows its own summary afterwards. */
  onFinish?: (result: Placement) => void;
}) {
  const router = useRouter();
  /*
    Snapshotted on mount. The page above is a Server Component and any refresh
    of it would otherwise hand down a freshly assembled paper, changing the
    question under somebody mid-answer. Same rule as ReviewSession's frozen queue.
  */
  const [items] = useState(initialItems);
  const [responses, setResponses] = useState<Response[]>([]);
  const [seenIntro, setSeenIntro] = useState<Skill[]>([]);
  const [result, setResult] = useState<Placement | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const shownAt = useRef(Date.now());

  const refs: ItemRef[] = useMemo(
    () => items.map(({ id, skill, band }) => ({ id, skill, band })),
    [items],
  );
  const cursor = nextCursor(refs, responses);
  const item = cursor.index === null ? null : items[cursor.index];

  const finish = useCallback(async (all: Response[]) => {
    const computed = placement(refs, all);
    setResult(computed);
    setSaving(true);
    try {
      const saved = await recordAssessment({
        items: refs,
        responses: all,
      });
      if (!saved.ok) setSaveFailed(true);
    } catch {
      // Offline, or the write failed. The result is still worth showing: it was
      // measured, and the learner did the work. It just cannot be kept.
      setSaveFailed(true);
    }
    setSaving(false);
    onFinish?.(computed);
  }, [refs, onFinish]);

  const answer = useCallback((given: Answer) => {
    if (!item) return;
    const response: Response = {
      itemId: item.id,
      skill: item.skill,
      band: item.band,
      credit: given.credit,
      ms: Date.now() - shownAt.current,
      ...(given.selfRating === undefined ? {} : { selfRating: given.selfRating }),
      ...(given.skipped ? { skipped: true } : {}),
    };
    shownAt.current = Date.now();
    const all = [...responses, response];
    setResponses(all);
    if (nextCursor(refs, all).index === null) void finish(all);
  }, [item, responses, refs, finish]);

  /** Abandons a whole section, for when the audio cannot play at all. */
  const skipSkill = useCallback((skill: Skill) => {
    const answered = new Set(responses.map((r) => r.itemId));
    const skips: Response[] = items
      .filter((i) => i.skill === skill && !answered.has(i.id))
      .map((i) => ({ itemId: i.id, skill: i.skill, band: i.band, credit: 0, ms: 0, skipped: true }));
    const all = [...responses, ...skips];
    setResponses(all);
    if (nextCursor(refs, all).index === null) void finish(all);
  }, [items, responses, refs, finish]);

  if (result) {
    if (onFinish) {
      return (
        <div className="py-6 text-center">
          <Mascot size={56} mood="cheer" className="mx-auto float" />
          <p className="mt-4 text-xl font-bold" style={{ color: "var(--ink)" }}>That is the check done.</p>
          {saving && <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>Keeping the result...</p>}
        </div>
      );
    }
    return (
      <div className="mx-auto w-full max-w-3xl px-5 py-10 md:px-8">
        {saveFailed && (
          <div className="mb-5">
            <Note tone="sky">
              <WifiOff size={14} className="mr-1.5 inline" aria-hidden />
              This result could not be saved, so it will not appear in your history. Everything below
              is still what you scored.
            </Note>
          </div>
        )}
        <ResultPanel result={result} />
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" onClick={() => { router.push("/assess"); router.refresh(); }}>
            What this means for my goal <ArrowRight size={15} aria-hidden />
          </Button>
          <ButtonLink href="/learn" size="lg">Pick words to work on</ButtonLink>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto w-full max-w-2xl px-5 py-16 text-center md:px-8">
        <Mascot size={56} mood="thinking" className="mx-auto" />
        <p className="mt-4 text-xl font-bold" style={{ color: "var(--ink)" }}>Working out your level...</p>
      </div>
    );
  }

  const section = SECTIONS[item.skill];
  const needsIntro = !seenIntro.includes(item.skill);
  const pct = progress(refs, responses);

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-8 md:px-8">
      {/* The check is four sections in one screen, so the section's own name is
          an h2 and there was nothing above it. Named for the whole sitting
          rather than for the section, which is what changes underneath it. */}
      <h1 className="sr-only">Level check</h1>
      <div className="mb-7">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>
            {section.title} · question {responses.filter((r) => !r.skipped).length + 1}
          </span>
          <Chip tone="neutral">{item.band}</Chip>
        </div>
        <Meter pct={pct} label={`Level check, ${pct} percent through`} />
      </div>

      {needsIntro ? (
        <Card>
          <div className="flex items-center gap-3">
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            >
              <section.icon size={20} aria-hidden />
            </span>
            <h2 className="text-2xl font-bold" style={{ color: "var(--ink)" }}>{section.title}</h2>
          </div>
          <p className="mt-4 max-w-[58ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {section.body}
          </p>
          {missing.includes(item.skill) && (
            <p className="mt-3 text-sm" style={{ color: "var(--ink-3)" }}>
              This section is shorter than usual: the dictionary on this deployment could not fill it.
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            <Button variant="primary" size="lg" onClick={() => setSeenIntro([...seenIntro, item.skill])}>
              Start this section <ArrowRight size={15} aria-hidden />
            </Button>
            <Button variant="ghost" onClick={() => skipSkill(item.skill)}>
              Skip {section.title.toLowerCase()}
            </Button>
          </div>
        </Card>
      ) : (
        <Card>
          {/*
            A section whose audio cannot be produced is abandoned rather than
            failed. `Speak` removes itself once the proxy has refused, so there
            is nothing left to retry with, and a silent speaker is a fact about
            this deployment rather than about anybody's listening.
          */}
          {item.kind === "choice" && (
            <ChoiceQuestion item={item} onAnswer={answer} onNoAudio={() => skipSkill(item.skill)} />
          )}
          {item.kind === "dictation" && (
            <DictationQuestion item={item} onAnswer={answer} onNoAudio={() => skipSkill(item.skill)} />
          )}
          {item.kind === "write" && <WriteQuestion item={item} onAnswer={answer} />}
          {item.kind === "speak" && <SpeakQuestion item={item} onAnswer={answer} />}
        </Card>
      )}

      {!needsIntro && (item.kind === "choice" || item.kind === "dictation") && item.skill === "listening" && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => skipSkill("listening")}
            className="min-h-[44px] text-xs underline underline-offset-2"
            style={{ color: "var(--ink-3)" }}
          >
            The audio will not play. Leave listening unmeasured.
          </button>
        </div>
      )}

      <div className="mt-8">
        <SectionTitle>How this is marked</SectionTitle>
        <p className="text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
          Questions climb through the levels and stop when a level is clearly past you, so this takes
          about ten minutes rather than forty. Nothing you answer here becomes a flashcard, and no
          answer is sent to an AI.
        </p>
      </div>
    </div>
  );
}
