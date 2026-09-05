"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Footprints } from "lucide-react";
import { recordEncounter } from "@/app/actions";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Button } from "@/components/Button";
import { Card, SectionTitle } from "@/components/ui";
import {
  isConversation, OUTCOMES, OUTCOME_LABEL, sceneForErrand,
  type Conversation, type Errand, type Outcome,
} from "@/lib/collections/errands";

/**
 * Whether any Estonian was spoken to a real person yesterday, and a small
 * thing to say today where the answer is no.
 *
 * THE QUESTION IS ABOUT A DAY THAT IS OVER. This card used to set an errand
 * in the morning and put the three answers underneath it, which asked for a
 * report on something that had not happened yet: at eight in the morning
 * those are not three answers, they are three ways to make a card go away.
 * And it could only see conversations this app had set, so a learner who
 * spent an hour with their Estonian mother-in-law and ignored the errand was
 * recorded as having done nothing, in the one number this app says it is
 * measured by.
 *
 * So it asks first and offers second. The three answers are the whole of what
 * is asked: no note, no where, no who, because a report that costs one press
 * is one a person makes. The switch to English is the only detail worth a
 * word, because it is the thing being practiced against, and "not yesterday"
 * is worded as a day that happened rather than as a failing, which is also
 * why it is answered with an errand instead of with encouragement.
 */
export function SayItToday({ errand, answered, conversations, days, unitTitle }: {
  errand: Errand;
  /** Today's answer, about yesterday, or null where the question is still open. */
  answered: Outcome | null;
  /** Conversations reported in the window, so the card can say what it is collecting. */
  conversations: number;
  days: number;
  unitTitle: string;
}) {
  const [answer, setAnswer] = useState<Outcome | null>(answered);
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const report = (outcome: Outcome) => {
    setAnswer(outcome);
    setFailed(false);
    start(async () => {
      /*
        No errand id: this is the learner's own day rather than our homework,
        and a conversation with a neighbor is not ours to take credit for.

        A report is not a grade, so it is not queued for a train (ADR-015): a
        press that did not land puts the three answers back with a line
        saying so, which is the star button's answer to the same failure. It
        used to throw into nothing and leave the card claiming the day was
        answered when the server had heard nothing.
      */
      try {
        const result = await recordEncounter(null, outcome);
        if (!result.ok) throw new Error(result.error);
        router.refresh();
      } catch {
        setAnswer(null);
        setFailed(true);
      }
    });
  };

  if (answer === null) {
    return (
      <Card>
        <SectionTitle hint="yesterday">Out there</SectionTitle>
        <p className="text-md leading-snug" style={{ color: "var(--ink)" }}>
          Did you speak any Estonian to somebody yesterday?
        </p>
        <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
          Anything counts. A shop, a colleague, one sentence at the door.
        </p>
        {failed && (
          <p className="mt-2 text-xs" role="status" style={{ color: "var(--hard-ink)" }}>
            That did not save. Try again when you are back online.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Whether you spoke Estonian yesterday">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              disabled={pending}
              onClick={() => report(o)}
              /*
                `border` and a height, which this card had never asked for:
                `.choice-btn` paints a border color and leaves the width to
                the caller, and its resting fill is the card's own surface, so
                three answers sat on Today as three runs of plain text. Every
                other caller of the class says both.
              */
              className="choice-btn min-h-[44px] rounded-full border px-4 py-2 text-sm"
            >
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
      </Card>
    );
  }

  /*
    A day with nothing in it is answered with something small to do about it,
    and today's errand is that. It carries no buttons of its own: the report
    comes tomorrow, when there is something to report, which is the whole
    argument this card was rebuilt on.
  */
  if (!isConversation(answer)) {
    const scene = sceneForErrand(errand);
    return (
      <Card>
        <SectionTitle>Say it today</SectionTitle>
        <p className="text-xs" style={{ color: "var(--ink-3)" }}>Then here is a small one for today.</p>
        <p className="mt-1 text-md leading-snug" style={{ color: "var(--ink)" }}>{errand.says}</p>
        {/*
          The place reads as part of the errand rather than as a hint in the
          corner of the card. It sat in the SectionTitle's hint slot, which on
          every other card on Today holds a level or a count, so "A bus stop, a
          corridor" was a caption belonging to nothing.
        */}
        <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
          {errand.where}. The words are in{" "}
          <Link href={`/learn/${errand.unit}`} className="underline">{unitTitle}</Link>.
          {" "}Nobody will slow down for you, and that is the practice.
        </p>
        {/*
          The rehearsal, where the course has one. Situations plays this
          same encounter on somebody with an agenda of their own, and for a
          while the two never pointed at each other: the errand sent people
          to a word list and the scene ended in "have it again".
        */}
        {scene && (
          <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
            Not sure of the words? <Link href={`/situations/${scene.id}`} className="underline">Rehearse it first</Link>, then go.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card>
      <SectionTitle hint="yesterday">Out there</SectionTitle>
      <p className="flex items-start gap-2 text-md leading-snug" style={{ color: "var(--ink)" }}>
        <Footprints size={16} aria-hidden className="mt-1" /> {REPLY[answer]}
      </p>
      <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
        {conversations === 1
          ? `Your first in the last ${days} days. `
          : `${conversations} in the last ${days} days. `}
        <Link href="/progress" className="underline">Progress keeps the count</Link>.
        {/*
          The switch is the thing being practised against, and every scene
          has a moment where the other side gives up on Estonian. A learner
          who was just switched on is the one person for whom that rehearsal
          is worth a line.
        */}
        {answer === "SWITCHED" && (
          <> Every <Link href="/situations" className="underline">conversation here</Link> has a moment where they switch, so you can rehearse holding the line.</>
        )}
      </p>
      {/*
        THE ONE THING WORTH KEEPING FROM A CONVERSATION IS THE WORD YOU DID
        NOT HAVE, and the card had nowhere to put it. It goes to the
        dictionary search, which is where a word gets looked up, added to the
        deck or reported as missing, and it is stored nowhere on the way:
        /privacy says the answer and the day are kept and nothing else, and
        that stays true.
      */}
      <form action="/dictionary" method="get" className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="out-there-word" className="label-xs mb-1 block" style={{ color: "var(--ink-3)" }}>
            A word you did not have?
          </label>
          <input
            id="out-there-word"
            name="q"
            lang="et"
            autoComplete="off"
            className="field w-full text-sm"
          />
        </div>
        <Button type="submit" size="sm">Look it up</Button>
      </form>
    </Card>
  );
}

/*
  Only the two answers that are a conversation. A day with nothing in it is
  answered with an errand rather than with a sentence, so there is nothing to
  say here about it, and a third entry would be copy no screen can reach.
*/
const REPLY: Record<Conversation, string> = {
  UNDERSTOOD: "They understood you. That is the whole point of all of this.",
  SWITCHED: "They switched. Answer in Estonian anyway next time; most people come back.",
};
