"use client";

import { useRef, useState } from "react";
import { Check, CircleAlert, Loader2, PenLine, X } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { DiacriticBar } from "@/components/DiacriticBar";
import { Chip, Stat } from "@/components/ui";
import { plainAsk, plainAskLine } from "@/lib/estonian/plainAsk";
import { MAX_SENTENCE_CHARS } from "@/lib/estonian/writing";
import type { GradedSentence } from "@/lib/tutor/grader";
import type { WithholdReason } from "@/lib/tutor/verify";
import { AI_TAG } from "@/lib/copy/values";
import { VERDICT_CLASS, VERDICT_INK, verdictOfRating } from "@/lib/ux/verdict";

export interface WritingPrompt {
  /** The card this exercise practises, so the round feeds the scheduler. */
  cardId: string;
  lexemeId: string;
  lemma: string;
  translation: string;
  caseKey: string;
  caseEn: string;
  caseEt: string;
  caseQuestion: string;
  provenance: "ekilex" | "derived";
  weak: boolean;
}

interface Marked {
  formCheck: { used: boolean; usedAnotherForm: boolean };
  graded: GradedSentence | null;
  aiAvailable: boolean;
  quotaMessage?: string;
  /** Forms Anu used that the dictionary could not vouch for. Its note is dropped. */
  withheld?: string[];
  /** Whether those were certainly Estonian, which decides what the notice claims. */
  withheldReason?: WithholdReason | null;
}

/**
 * The one exercise in the app where the learner produces Estonian of their own
 * rather than recalling the back of a card.
 *
 * The result is shown in two clearly separate parts, because they have different
 * authorities behind them: whether the required form was used is checked against
 * the dictionary and is certain; what Anu says about the rest of the sentence is
 * a model's opinion and is labelled as one.
 */
export function WriteSession({ prompts: initialPrompts, aiAvailable }: {
  prompts: WritingPrompt[]; aiAvailable: boolean;
}) {
  /*
    Snapshotted once on mount, never updated from later props. gradeCard() is a
    Server Action and Next refreshes this route's Server Component after every
    call, which hands down a freshly computed task list: the word under the
    learner's feedback would change while they were still reading it. The set
    the page found on first load is the only one this session should know
    about. ReviewSession froze its queue for the same reason; these four modes
    started grading in this change and inherited the hazard with it.
  */
  const [prompts] = useState(initialPrompts);
  const [index, setIndex] = useState(0);
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [marked, setMarked] = useState<Marked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const startedAt = useRef(Date.now());

  const prompt = prompts[index];
  const finished = !prompt;

  async function submit() {
    if (!prompt || busy || sentence.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/write", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lexemeId: prompt.lexemeId, caseKey: prompt.caseKey, sentence,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Couldn't mark that.");
        return;
      }
      const result = body as Marked;
      setMarked(result);
      if (result.formCheck.used) setCorrect((c) => c + 1);

      /*
        ADR-016: this writes to the same review log as everything else. The
        dictionary check decides the rating, not the model. A form that is
        right is Good; the right word in the wrong case is Hard, which is the
        reading the picture round already gives the same situation, since the
        app can tell that middle case apart with certainty; a sentence without
        the word is Again. Anu's opinion of the surrounding sentence never
        moves anybody's schedule.
      */
      void gradeCard(prompt.cardId, writeRating(result.formCheck), Date.now() - startedAt.current)
        .catch(() => {});
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
          Tubli töö. Writing your own sentences takes longer, but it&rsquo;s what really helps with
          speaking.
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={prompts.length} label="Written" />
          <Stat
            value={`${Math.round((correct / prompts.length) * 100)}%`}
            label="Right form"
            tone={VERDICT_INK[correct === prompts.length ? "right" : "nearly"]}
          />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
          <ButtonLink href="/review/write">Another round</ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw. Same line as the
          other six modes: the empty state carries one and the round did not,
          which is why an accessibility run that happened to meet an empty deck
          saw a heading and passed. */}
      <h1 className="sr-only">Writing</h1>
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
          <Chip tone="accent"><PenLine size={12} aria-hidden /> Write a sentence</Chip>
          {prompt.weak && <Chip tone="hard">your weak case</Chip>}
        </div>

        <div className="px-6 py-8">
          <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
            Use{" "}
            <strong lang="et" className="text-lg" style={{ color: "var(--ink)" }}>
              {prompt.lemma}
            </strong>{" "}
            <span style={{ color: "var(--ink-3)" }}>({prompt.translation})</span> in a sentence.
          </p>
          {/*
            The ask, then what it is called. This led with `seesütlev` at 24px
            in the accent and put the question and the English name in grey
            underneath, which is three names and no instruction: somebody who
            has not met the word `seesütlev` had nothing on the screen telling
            them what sentence to write. `plainAsk` is the one table of what a
            case means in plain English, and the names stay on the card as the
            cross-reference they have always been.
          */}
          {plainAsk(prompt.caseKey) ? (
            <>
              <p className="mt-2 text-[22px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
                {plainAskLine(prompt.caseKey)}
              </p>
              {/* The Estonian name carries the line's `lang`, since it is the
                  part a screen reader has to pronounce as Estonian and the part
                  `smoke-interact.mjs` reads the task off; the English name is
                  marked back as English inside it. */}
              <p lang="et" className="mt-1.5 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
                {prompt.caseEt} · {prompt.caseQuestion}
                <span lang="en"> · the {prompt.caseEn.toLowerCase()}</span>
              </p>
            </>
          ) : (
            <>
              <p lang="et" className="mt-1 text-2xl font-semibold" style={{ color: "var(--accent-deep)" }}>
                {prompt.caseEt}
              </p>
              <p className="mt-1 text-[13.5px]" style={{ color: "var(--ink-3)" }}>
                <span lang="et">{prompt.caseQuestion}</span> · the {prompt.caseEn.toLowerCase()}
              </p>
            </>
          )}

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
              className="mt-2 w-full resize-none rounded-md border px-3.5 py-3 text-[17px] disabled:opacity-70"
              style={{ borderColor: "var(--rule)", background: "var(--raised)", color: "var(--ink)" }}
            />
            {!marked && <div className="mt-2"><DiacriticBar /></div>}
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm" style={{ color: "var(--again-ink)" }}>{error}</p>
          )}

          {marked && <Feedback marked={marked} />}
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
          Anu isn&rsquo;t available here, so only the form is checked. That check is the reliable half.
        </p>
      )}
    </div>
  );
}

/**
 * Two verdicts, visibly separate. The form check comes from the dictionary and
 * is certain; Anu's note is a model's opinion. Blending them into one score
 * would borrow the dictionary's authority for the model's guess.
 */
/** Good, Hard or Again off the dictionary's own check, read once for the grade and the paint. */
function writeRating(formCheck: Marked["formCheck"]): 1 | 2 | 3 {
  return formCheck.used ? 3 : formCheck.usedAnotherForm ? 2 : 1;
}

function Feedback({ marked }: { marked: Marked }) {
  const { formCheck, graded, quotaMessage, withheld, withheldReason } = marked;

  return (
    <div className="mt-6 flex flex-col gap-3" aria-live="polite">
      <div className={`${VERDICT_CLASS[verdictOfRating(writeRating(formCheck))]} flex items-start gap-2.5 rounded-md px-3.5 py-3`}>
        {formCheck.used
          ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden />
          : <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />}
        <p className="text-[15px]">
          {formCheck.used
            ? "That is the right form."
            : formCheck.usedAnotherForm
              ? "That is the right word in the wrong case. Check the ending."
              : "The word you were asked to use is not in that sentence."}
        </p>
      </div>

      {withheld && withheld.length > 0 && (
        <div
          className="rounded-md border px-3.5 py-3"
          style={{ borderColor: "var(--rule)", background: "var(--raised)" }}
        >
          <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
            {withheldReason === "unvouched-word" ? (
              <>
                Anu&rsquo;s note is hidden here. It used a word we couldn&rsquo;t confirm as Estonian,
                it might just have been English. The check above comes straight from the
                dictionary, so it stands.
              </>
            ) : (
              <>
                Anu&rsquo;s note is hidden here. It used an Estonian form we couldn&rsquo;t confirm,
                and we never show a form we haven&rsquo;t checked. The check above comes straight
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
          <div className="mb-1.5 flex items-center gap-2">
            <Chip tone={graded.verdict === "correct" ? "good" : graded.verdict === "almost" ? "hard" : "again"}>
              {graded.verdict === "correct" ? "reads well" : graded.verdict === "almost" ? "almost" : "not yet"}
            </Chip>
            <span className="label-xs" style={{ color: "var(--ink-3)" }}>{AI_TAG}</span>
          </div>
          <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>{graded.comment}</p>
          {graded.rule && (
            <p className="mt-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
              Rule: {graded.rule}
            </p>
          )}
        </div>
      )}

      {quotaMessage && (
        <p className="text-sm" style={{ color: "var(--ink-3)" }}>{quotaMessage}</p>
      )}
    </div>
  );
}
