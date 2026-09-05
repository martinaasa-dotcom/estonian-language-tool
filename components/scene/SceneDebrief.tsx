"use client";

import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Button, ButtonLink } from "@/components/Button";
import { Card, Chip } from "@/components/ui";
import { AddWordButton } from "@/components/AddWordButton";
import { DrillLink } from "@/components/DrillLink";
import type { SceneSpec } from "@/lib/scenes/types";
import { drillFor } from "@/lib/scenes/drills";
import { curveballById } from "@/lib/scenes/curveballs";
import type { SceneReview } from "@/lib/scenes/review";

/** So "words your conversations needed" is a query and never a counter (ADR-014). */
export const SCENE_SOURCE = "SCENE";

/**
 * The debrief, and the order is the argument (§12).
 *
 * 1. **What happened**, in one line, before any teaching. A person remembers
 *    the outcome, so it goes first.
 * 2. **What you got done**: the required beats, ticked. A count of things
 *    achieved, never a percentage, because a mark on a conversation is a claim
 *    about somebody's Estonian and only the mock exam may make one (ADR-022).
 * 3. **Your turns**, so a learner can read back what they actually said.
 * 4. **How it went**, which is the review a teacher gives after a role-play:
 *    it leads on how much of what you said was understood, and then names
 *    each ending that came out as something else, what that ending is for,
 *    and your own words beside the ones the other side used. English, and
 *    derived from the transcript rather than written here
 *    (`lib/scenes/review.ts`).
 * 5. **The words you needed and did not have**, each with an add-to-deck
 *    button, from the help button and from the beats that stalled.
 * 6. **One thing to work on**, as a `DrillLink` into the drill that addresses
 *    it, rather than advice this screen wrote itself.
 * 7. **Try it again**, which is one button, because the second run is where
 *    most of the learning is.
 *
 * No score anywhere on this screen. That is not an omission.
 */
export interface Debrief {
  scene: SceneSpec;
  objectives: { met: readonly string[]; missed: readonly string[] };
  hurdles: readonly { id: string; beat: number; met: boolean }[];
  outcome: { id: string; says: string } | null;
  gaps: readonly { lemma: string; lexemeId: string | null }[];
  /** What to do differently, in English, derived from the run (`lib/scenes/review.ts`). */
  review: SceneReview;
  graded: number;
  /** The conversation, both sides, in order. A stage direction is not a line and is left out. */
  turns: readonly { who: "them" | "you"; text: string }[];
}

export function SceneDebrief({ debrief, onAgain }: { debrief: Debrief; onAgain: () => void }) {
  const { scene, objectives, hurdles, outcome, gaps, turns, graded, review } = debrief;
  const byId = new Map(scene.beats.map((beat) => [beat.id, beat]));
  const required = scene.beats.filter((beat) => beat.required);
  const missed = objectives.missed.length > 0 ? byId.get(objectives.missed[0]!) : undefined;
  const drill = missed ? drillFor(missed.needs) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* What happened, first, before any teaching. */}
      <Card tone="mint" className="flex flex-col gap-2">
        <h2 className="font-medium">
          {outcome?.says ?? "The conversation ended before it got anywhere."}
        </h2>
        <p className="text-sm" style={{ color: "var(--ink-2)" }}>
          {objectives.met.length} of {required.length} things you came in to get done.
        </p>
      </Card>

      <section>
        <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>What you got done</h3>
        <ul className="flex flex-col gap-1">
          {required.map((beat) => {
            const met = objectives.met.includes(beat.id);
            return (
              <li key={beat.id} className="flex items-center gap-2 text-sm">
                <span aria-hidden style={{ color: met ? "var(--mint-ink)" : "var(--ink-3)" }}>
                  {met ? "✓" : "·"}
                </span>
                <span style={{ color: met ? "var(--ink)" : "var(--ink-3)" }}>{beat.goal}</span>
                <span className="sr-only">{met ? "done" : "not this time"}</span>
              </li>
            );
          })}
        </ul>
      </section>

      {hurdles.length > 0 && (
        <section>
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>What went wrong on the way</h3>
          {/*
            The curveballs this run drew, and whether each was dealt with.
            Named in the debrief and nowhere before it, because pressure is
            felt in what the other person says and not announced (§7); here it
            is over, and the learner can read what caught them out.
          */}
          <ul className="flex flex-col gap-1">
            {hurdles.map((hurdle) => {
              const spec = curveballById(hurdle.id as never);
              if (!spec) return null;
              return (
                <li key={`${hurdle.id}-${hurdle.beat}`} className="flex items-start gap-2 text-sm">
                  <span aria-hidden style={{ color: hurdle.met ? "var(--mint-ink)" : "var(--ink-3)" }}>
                    {hurdle.met ? "✓" : "·"}
                  </span>
                  <span style={{ color: hurdle.met ? "var(--ink)" : "var(--ink-3)" }}>
                    {spec.says} {hurdle.met ? "You handled it." : "They let it go."}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {turns.length > 0 && (
        <section>
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>What was said</h3>
          {/*
            Both sides rather than the learner's alone, because a turn only
            makes sense beside the line it answered, and reading the whole
            exchange back is how somebody notices that "poodi" was the right
            answer to the wrong question.
          */}
          <ul className="flex flex-col gap-2">
            {turns.map((turn, index) => (
              <li key={index} className={turn.who === "you" ? "self-end text-right" : "self-start"}>
                <Card className="inline-block max-w-full text-sm">
                  <span lang="et" style={turn.who === "them" ? { color: "var(--ink-2)" } : undefined}>
                    {turn.text}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>How it went</h3>
        {/*
          The lead is the sentence a learner takes away, and it is about being
          understood rather than about being right: those are the same run
          described two ways, and only one of them gets somebody to open the
          next scene. The notes under it are the teaching, in the quiet ink,
          with the learner's own words beside the ones the other side used.
        */}
        <p className="text-sm">{review.lead}</p>
        {review.notes.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3">
            {review.notes.map((note) => (
              <li key={note.id}>
                <p className="text-sm font-medium">{note.heading}</p>
                <p className="text-sm" style={{ color: "var(--ink-2)" }}>{note.body}</p>
                {note.evidence.length > 0 && (
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm">
                    {note.evidence.map((one) => (
                      <li key={one.said} className="flex flex-wrap items-baseline gap-x-2">
                        <span lang="et" style={{ color: "var(--ink-3)" }}>{one.said}</span>
                        {one.form ? (
                          <>
                            <span style={{ color: "var(--ink-3)" }}>is said</span>
                            <span lang="et" className="font-medium">{one.form}</span>
                          </>
                        ) : (
                          <span style={{ color: "var(--ink-3)" }}>was understood as it stood</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {gaps.length > 0 && (
        <section>
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            Words this conversation needed
          </h3>
          {/*
            Help is counted and never taken away: a learner who asks for four
            words and finishes has learned more than one who gave up with none.
            So this is a list with a way to keep them, not a tally of mistakes.
          */}
          <ul className="flex flex-wrap gap-2">
            {gaps.map((gap) => (
              <li key={gap.lemma} className="flex items-center gap-1">
                <Chip tone="neutral" caseSensitive>{gap.lemma}</Chip>
                {/*
                  A word the dictionary holds can be kept; one it does not is
                  still listed, because "the conversation needed this and you
                  did not have it" is true either way and hiding it would hide
                  exactly the gaps worth reporting.
                */}
                {gap.lexemeId && (
                  <AddWordButton lexemeId={gap.lexemeId} lemma={gap.lemma} source={SCENE_SOURCE} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {missed && (
        <section>
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>One thing to work on</h3>
          <p className="mb-2 text-sm" style={{ color: "var(--ink-2)" }}>{missed.goal}</p>
          {/*
            A link into a drill that already exists rather than advice this
            screen invented, and the drill is read off what the beat needed
            rather than being the same one every time. `assessReadiness` makes
            the same move on the exam hub and for the same reason: the app knows
            what it can drill and does not know what to say. Where no drill
            rehearses what was missed there is no link, because a link to the
            wrong drill is a screen saying "go and practise this" about
            something else.
          */}
          {drill && <DrillLink href={drill} />}
        </section>
      )}

      {graded > 0 && (
        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          {graded === 1 ? "One word" : `${graded} words`} you used went into your review schedule.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Try it again keeps the scene and redraws everything else. */}
        <Button onClick={onAgain}>Have it again</Button>
        <ButtonLink href="/situations" variant="ghost">Another conversation</ButtonLink>
      </div>

      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
        <Link href="/progress">Your progress</Link> counts this the way it counts a review.
      </p>
    </div>
  );
}
