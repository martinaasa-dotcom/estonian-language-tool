"use client";

import { useRef, useState } from "react";
import { Check, CircleAlert, Loader2, X } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { DiacriticBar } from "@/components/DiacriticBar";
import { Chip, Stat } from "@/components/ui";
import { AI_TAG } from "@/lib/copy/values";
import { MAX_SENTENCE_CHARS } from "@/lib/estonian/writing";
import type { DescribeMark } from "@/lib/games/describe";
import type { GradedSentence } from "@/lib/tutor/grader";
import type { WithholdReason } from "@/lib/tutor/verify";
import { CASES } from "@/lib/estonian/cases";
import { grammarTerm } from "@/lib/estonian/terms";

export interface ScenePrompt {
  sceneId: string;
  situation: string;
  /** The card this practises, where the learner has one for the named word. */
  cardId: string | null;
  /**
   * The three things: the character, and what it means in English.
   *
   * The English is what makes the picture reach somebody who cannot see it. An
   * emoji carries a meaning to a sighted reader without a word of text, so
   * `aria-hidden` on it and nothing else would leave a screen reader with two
   * thirds of the exercise missing, and the answer is not alt text on each one:
   * it is the same information in the same place, which is what the sentence
   * under the row says. No Estonian is in it, so this is parity rather than a
   * giveaway. Only the named word's Estonian appears before the marking.
   */
  things: { emoji: string; translation: string }[];
  askIndex: number;
  askLemma: string;
  askTranslation: string;
  caseKey: string;
  caseEt: string;
  caseEn: string;
  caseQuestion: string;
}

interface Reveal {
  words: { emoji: string; lemma: string; translation: string }[];
  wanted: string[];
  /** A sentence to read afterwards, and what it is evidence of. See `ModelAnswer`. */
  answer: { et: string; source: "contributed" | "this-form" | "this-word" } | null;
}

interface Marked {
  mark: DescribeMark;
  reveal: Reveal;
  graded: GradedSentence | null;
  aiAvailable: boolean;
  quotaMessage?: string;
  withheld?: string[];
  withheldReason?: WithholdReason | null;
}

/**
 * A picture, a case, and a box.
 *
 * Two authorities on the screen and they stay apart, which is the arrangement
 * `/review/write` settled on: whether the case was right is the dictionary's
 * answer and is certain, and what Anu says about the rest of the sentence is a
 * model's opinion and is labelled as one. What is new here is the middle
 * verdict. A learner who wrote the right word with the wrong ending is told
 * which ending they wrote, by name, because `lib/estonian/whichCase.ts` can
 * work that out with certainty and "not the form we asked for" is the least
 * useful true thing this app could say instead.
 */
export function DescribeSession({ prompts: initialPrompts, aiAvailable }: {
  prompts: ScenePrompt[]; aiAvailable: boolean;
}) {
  /*
    Snapshotted once. `gradeCard` is a Server Action and Next re-renders this
    route's Server Component after every call, which would hand down a freshly
    drawn round and change the picture under somebody still reading their
    feedback. Every mode that grades froze its queue for this reason.
  */
  const [prompts] = useState(initialPrompts);
  const [index, setIndex] = useState(0);
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState<Marked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const startedAt = useRef(Date.now());

  const prompt = prompts[index];
  const finished = !prompt;

  async function submit() {
    if (!prompt || busy || sentence.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/describe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sceneId: prompt.sceneId,
          caseKey: prompt.caseKey,
          askLemma: prompt.askLemma,
          sentence,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't mark that.");
        return;
      }
      const result = body as Marked;
      setMarked(result);
      if (result.mark.rightCase) setRight((n) => n + 1);

      /*
        ADR-016: the same review log as everything else, and the dictionary
        decides the rating rather than the model. Three of the four ratings are
        reachable here because the app can tell the middle case apart with
        certainty: the right word in the wrong ending is a Hard, not an Again.
        A scene whose words are all new to this deck carries no card, and
        nothing is written for it.
      */
      if (prompt.cardId) {
        void gradeCard(prompt.cardId, result.mark.rating, Date.now() - startedAt.current)
          .catch(() => {});
      }
    } catch {
      setError("Marking needs a connection. Your sentence is still here.");
    } finally {
      setBusy(false);
    }
  }

  function next() {
    setMarked(null);
    setSentence("");
    setError(null);
    setIndex((i) => i + 1);
  }

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Round complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          Writing about something in front of you is the closest this app gets to speaking.
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={prompts.length} label="Written" />
          <Stat
            value={`${Math.round((right / prompts.length) * 100)}%`}
            label="Right case"
            tone={right === prompts.length ? "var(--good)" : "var(--hard)"}
          />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
          <ButtonLink href="/review/describe">Another round</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw. Every mode carries
          one: the empty state had a heading and the round did not, so an
          accessibility run that met an empty deck saw one and passed. */}
      <h1 className="sr-only">Say what you see</h1>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(index / prompts.length) * 100}%`, background: "var(--accent)" }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={prompts.length}
            aria-label="Round progress"
          />
        </div>
        <span className="tnum text-sm" style={{ color: "var(--ink-3)" }}>
          {prompts.length - index} left
        </span>
      </div>

      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent">{prompt.situation}</Chip>
        </div>

        <div className="px-6 py-8">
          {/* Decoration in the sense that a photograph on a worksheet is: the
              meaning is here rather than in the text, so it is announced to a
              reader who cannot see it by the words underneath and by the
              reveal after marking, never by an alt text naming the answer. */}
          <p
            className="text-center leading-none"
            style={{ fontSize: "clamp(44px, 14vw, 64px)" }}
          >
            <span aria-hidden>{prompt.things.map((t) => t.emoji).join(" ")}</span>
            <span className="sr-only">
              A picture of {prompt.things.map((t) => t.translation.split(",")[0]!.trim()).join(", ")}.
            </span>
          </p>

          <p className="mt-7 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
            Write one sentence about this, with{" "}
            <strong lang="et" className="text-lg" style={{ color: "var(--ink)" }}>
              {prompt.askLemma}
            </strong>{" "}
            <span style={{ color: "var(--ink-3)" }}>({prompt.askTranslation})</span> in the
          </p>
          <p lang="et" className="mt-1 text-2xl font-semibold" style={{ color: "var(--accent-deep)" }}>
            {prompt.caseEt}
          </p>
          <p className="mt-1 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
            <span lang="et">{prompt.caseQuestion}</span> · the {prompt.caseEn.toLowerCase()}
          </p>

          <div className="mt-6">
            <label htmlFor="sentence" className="label-xs block" style={{ color: "var(--ink-3)" }}>
              Your sentence
            </label>
            <textarea
              id="sentence"
              value={sentence}
              lang="et"
              rows={3}
              maxLength={MAX_SENTENCE_CHARS}
              disabled={!!marked}
              autoFocus
              onChange={(e) => setSentence(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
              }}
              placeholder="Kirjuta oma lause siia…"
              className="mt-2 w-full resize-none rounded-md border px-3.5 py-3 text-[17px] outline-none disabled:opacity-70"
              style={{ borderColor: "var(--rule)", background: "var(--raised)", color: "var(--ink)" }}
            />
            {!marked && <div className="mt-2"><DiacriticBar /></div>}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm" style={{ color: "var(--again-ink)" }}>{error}</p>
          )}

          {marked && <Feedback marked={marked} prompt={prompt} />}
        </div>

        <div className="border-t p-4" style={{ borderColor: "var(--rule-soft)" }}>
          {!marked ? (
            <Button
              variant="primary"
              className="w-full py-3"
              disabled={busy || sentence.trim().length === 0}
              onClick={() => void submit()}
            >
              {busy
                ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Marking…</>
                : <>Check it <kbd className="ml-1">⌘↵</kbd></>}
            </Button>
          ) : (
            <Button variant="primary" className="w-full py-3" onClick={next} autoFocus>
              Next
            </Button>
          )}
        </div>
      </div>

      {!aiAvailable && (
        <p className="mt-4 text-center text-[12.5px]" style={{ color: "var(--ink-3)" }}>
          Anu isn&rsquo;t available here, so only the case is checked. That check is the reliable half.
        </p>
      )}
    </div>
  );
}

/** What the case a learner reached for is called, or nothing where two share the spelling. */
function nameOf(key: string): string | null {
  const spec = CASES.find((c) => c.key === key);
  if (!spec) return null;
  return grammarTerm(spec.key)?.et ?? spec.et;
}

/**
 * Three verdicts, in the order they are worth reading.
 *
 * The case, which is certain. Then the picture, which is the other mechanical
 * thing this knows and the reason the words are worth revealing at all. Then
 * Anu, labelled, last, and never allowed to look like part of the first.
 */
function Feedback({ marked, prompt }: { marked: Marked; prompt: ScenePrompt }) {
  const { mark, reveal, graded, quotaMessage, withheld, withheldReason } = marked;
  const wrote = mark.verdict?.kind === "one" ? nameOf(mark.verdict.key) : null;

  return (
    <div className="mt-6 flex flex-col gap-3" aria-live="polite">
      <div
        className="flex items-start gap-2.5 rounded-md px-3.5 py-3"
        style={{
          background: mark.rightCase ? "var(--good-soft)" : "var(--again-soft)",
          color: mark.rightCase ? "var(--good)" : "var(--again)",
        }}
      >
        {mark.rightCase
          ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden />
          : <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />}
        <p className="text-[15px]">
          {mark.rightCase ? (
            <>That is the {prompt.caseEt}.</>
          ) : mark.written && wrote ? (
            /*
              The line this mode exists for. Every other screen can only say
              the form was not the one asked for; this one can name what was
              written instead, because exactly one case is spelled that way.
            */
            <>
              You wrote <strong lang="et">{mark.written}</strong>, which is the{" "}
              <span lang="et">{wrote}</span>. The{" "}
              <span lang="et">{prompt.caseEt}</span> is{" "}
              <strong lang="et">{reveal.wanted.join(" / ")}</strong>.
            </>
          ) : mark.written ? (
            // Two cases share that spelling, so naming either would be a guess.
            <>
              <strong lang="et">{mark.written}</strong> is more than one case at once, so it
              cannot be this one. The <span lang="et">{prompt.caseEt}</span> is{" "}
              <strong lang="et">{reveal.wanted.join(" / ")}</strong>.
            </>
          ) : (
            <>
              <strong lang="et">{prompt.askLemma}</strong> is not in that sentence. The{" "}
              <span lang="et">{prompt.caseEt}</span> is{" "}
              <strong lang="et">{reveal.wanted.join(" / ")}</strong>.
            </>
          )}
        </p>
      </div>

      <div
        className="rounded-md border px-3.5 py-3"
        style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
      >
        <p className="label-xs" style={{ color: "var(--ink-3)" }}>What was in the picture</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {reveal.words.map((word, i) => (
            <li key={word.lemma} className="flex items-baseline gap-2 text-[15px]">
              <span aria-hidden className="text-lg leading-none">{word.emoji}</span>
              <strong lang="et" style={{ color: "var(--ink)" }}>{word.lemma}</strong>
              <span style={{ color: "var(--ink-3)" }}>{word.translation}</span>
              {mark.used[i] && (
                <Check size={13} aria-label="you used this one" style={{ color: "var(--mint-ink)" }} />
              )}
            </li>
          ))}
        </ul>
      </div>

      {reveal.answer && (
        <div
          className="rounded-md border px-3.5 py-3"
          style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
        >
          {/*
            Whose sentence this is and what it shows, said out loud, because
            the three are not the same claim. A native speaker wrote theirs
            about this picture. A lexicographer wrote theirs to illustrate this
            word, and whether it happens to carry the case just asked for is
            the difference between a model answer and a good sentence with the
            right word in it. None of the three is a mark, and none is compared
            against what the learner wrote: there are many right sentences
            about three things, which is the point of asking.
          */}
          <p className="label-xs" style={{ color: "var(--ink-3)" }}>
            {reveal.answer.source === "contributed"
              ? "How a native speaker put it"
              : reveal.answer.source === "this-form"
                ? `A recorded sentence with ${prompt.askLemma} in this case`
                : `A recorded sentence with ${prompt.askLemma} in it`}
          </p>
          <p lang="et" className="mt-1.5 text-[15px]" style={{ color: "var(--ink)" }}>
            {reveal.answer.et}
          </p>
        </div>
      )}

      {withheld && withheld.length > 0 && (
        <div
          className="rounded-md border px-3.5 py-3"
          style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
        >
          <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
            {withheldReason === "unvouched-word" ? (
              <>
                Anu&rsquo;s note is hidden here. It used a word we couldn&rsquo;t confirm as
                Estonian, it might just have been English. The check above comes straight from
                the dictionary, so it stands.
              </>
            ) : (
              <>
                Anu&rsquo;s note is hidden here. It used an Estonian form we couldn&rsquo;t
                confirm, and a wrong form is worse than no note. The check above comes straight
                from the dictionary, so it stands.
              </>
            )}
          </p>
        </div>
      )}

      {graded && graded.comment && (
        <div
          className="rounded-md border px-3.5 py-3"
          style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
        >
          <p className="label-xs" style={{ color: "var(--ink-3)" }}>{AI_TAG}</p>
          <p className="mt-1.5 text-[15px]" style={{ color: "var(--ink-2)" }}>{graded.comment}</p>
          {graded.rule && (
            <p className="mt-2 text-[13.5px]" style={{ color: "var(--ink-3)" }}>{graded.rule}</p>
          )}
        </div>
      )}

      {quotaMessage && (
        <p className="text-[13.5px]" style={{ color: "var(--ink-3)" }}>{quotaMessage}</p>
      )}
    </div>
  );
}
