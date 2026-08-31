"use client";

import { useState } from "react";
import { ArrowRight, MessageCircleQuestion, Pause, Stethoscope, Trash2 } from "lucide-react";
import { deleteCard, setCardSuspended } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Card, Chip, Page, SectionTitle } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { buildClinicQuestion, type Leech } from "@/lib/analysis/leeches";
import { caseByKey } from "@/lib/estonian/cases";

export interface ClinicItem extends Omit<Leech, "history"> {
  history: { rating: number; at: string }[];
  confusable: string[];
}

const SHAPE_LABEL: Record<string, string> = {
  "never-stuck": "never stuck",
  regressed: "regressed",
  unstable: "unstable",
  early: "early days",
};

/**
 * One card per leech, with its actual failure history and a question that is
 * already written.
 *
 * The three actions offered are the three honest options: understand it, park
 * it, or admit it is not worth learning. Burying it silently — what most SRS
 * apps do — is the one option deliberately absent, because it looks like
 * progress and is not.
 */
export function ClinicList({ items, aiAvailable }: { items: ClinicItem[]; aiAvailable: boolean }) {
  const [handled, setHandled] = useState<Record<string, "suspended" | "deleted">>({});

  return (
    <Page
      title="Leech clinic"
      lead="The cards you keep failing, and what their history says."
    >
      <div className="flex flex-col gap-4">
        {items.map((leech) => {
          const state = handled[leech.cardId];
          const question = buildClinicQuestion(
            { ...leech, history: leech.history.map((h) => ({ rating: h.rating, at: new Date(h.at) })) },
            leech.confusable,
          );

          return (
            <Card key={leech.cardId}>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="again"><Stethoscope size={12} aria-hidden /> {leech.lapses} lapses</Chip>
                <Chip tone="hard">{SHAPE_LABEL[leech.shape]}</Chip>
                <Chip>{leech.failRate}% wrong</Chip>
                {state && <Chip tone="neutral">{state}</Chip>}
              </div>

              <div className="mt-3 flex flex-wrap items-baseline gap-2">
                <p lang="et" className="text-[22px] font-semibold" style={{ color: "var(--ink)" }}>
                  {leech.front}
                </p>
                <ArrowRight size={14} aria-hidden style={{ color: "var(--ink-3)" }} />
                <p className="text-lg" style={{ color: "var(--accent-deep)" }}>{leech.back}</p>
                {leech.lemma && <Speak text={leech.lemma} />}
              </div>

              <Timeline history={leech.history} />

              <p className="mt-3 text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                This card {leech.pattern}.
                {leech.confusable.length > 0 && (
                  <> Similar words already in your deck:{" "}
                    <span lang="et">{leech.confusable.join(", ")}</span>.
                  </>
                )}
              </p>

              {!state && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {aiAvailable && (
                    <ButtonLink href={`/tutor?ask=${encodeURIComponent(question)}`} variant="primary">
                      <MessageCircleQuestion size={15} aria-hidden /> Ask Anu about it
                    </ButtonLink>
                  )}
                  {leech.targetCase && (
                    <ButtonLink href={`/review?case=${leech.targetCase}`}>
                      Drill the{" "}
                      <span lang="et">
                        {caseByKey(leech.targetCase)?.et ?? leech.targetCase.toLowerCase()}
                      </span>
                    </ButtonLink>
                  )}
                  <Button
                    onClick={async () => {
                      await setCardSuspended(leech.cardId, true);
                      setHandled((h) => ({ ...h, [leech.cardId]: "suspended" }));
                    }}
                  >
                    <Pause size={15} aria-hidden /> Park it for now
                  </Button>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await deleteCard(leech.cardId);
                      setHandled((h) => ({ ...h, [leech.cardId]: "deleted" }));
                    }}
                  >
                    <Trash2 size={15} aria-hidden /> Not worth learning
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-8">
        <SectionTitle>Why this exists</SectionTitle>
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
          A spaced-repetition system normally handles a card like this by burying it after a set
          number of lapses. That removes it from your queue and teaches you nothing. The review log
          already knows how each of these is failing (steadily, or after a good run, or in
          alternation) and that is usually enough to work out what to do about it. Deleting a card
          keeps its review history: the log is append-only.
        </p>
      </div>
    </Page>
  );
}

/**
 * The failure history as a strip, oldest on the left.
 *
 * A FAILURE AND A RECALL ARE DIFFERENT SHAPES, NOT JUST DIFFERENT HUES.
 *
 * They were peach and mint squares with a `title` on each, and CLAUDE.md
 * already says what is wrong with that in the dictation drill: a colour may
 * not be the only thing carrying a distinction, and a tooltip is not text.
 * The `aria-hidden` and the `sr-only` line below meant a screen reader was
 * fine; somebody who simply cannot separate those two hues, on a phone where
 * no tooltip exists, had a row of identical squares. Telling a failure from a
 * recall is the whole of what this strip is for.
 *
 * A failure is full height and a recall is a third of it, which is the
 * sparkline idiom and reads at 10 pixels. The hues stay, because they are
 * right and because two signals are better than one.
 *
 * And the count is visible rather than only announced. It was already written
 * for a screen reader; there was no reason the person looking at the strip
 * could not have it too.
 */
function Timeline({ history }: { history: { rating: number; at: string }[] }) {
  const shown = history.slice(-24);
  if (shown.length === 0) return null;
  const failures = shown.filter((h) => h.rating <= 2).length;

  return (
    <div className="mt-3">
      <div className="flex flex-wrap items-end gap-1" aria-hidden>
        {shown.map((h, i) => {
          const failed = h.rating <= 2;
          return (
            <span
              key={i}
              title={`${new Date(h.at).toLocaleDateString()} · ${failed ? "failed" : "recalled"}`}
              className={`w-2.5 rounded-[2px] ${failed ? "h-2.5" : "h-1"}`}
              style={{ background: failed ? "var(--again)" : "var(--good)" }}
            />
          );
        })}
      </div>
      <p className="mt-1.5 text-2xs" style={{ color: "var(--ink-3)" }}>
        {failures} {failures === 1 ? "failure" : "failures"} in the last {shown.length} reviews.
        Tall marks are the failures.
      </p>
    </div>
  );
}
