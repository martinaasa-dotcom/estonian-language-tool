"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Footprints, Search } from "lucide-react";
import { recordEncounter } from "@/app/actions";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Card, SectionTitle } from "@/components/ui";
import { OUTCOMES, OUTCOME_LABEL, type Errand, type Outcome } from "@/lib/collections/errands";

/**
 * One thing to say to a real person today, and how it went.
 *
 * The three answers are the whole of what is asked. No note, no where, no
 * who: a report that costs one press is one a person makes, and the switch
 * to English is the only detail worth a word, because it is the thing being
 * practised against. "I did not manage it" is an answer that counts too,
 * and it is worded as a thing that happened rather than a failing.
 *
 * The box underneath is the way back into the dictionary for a word you
 * caught half of: the search already folds what an English ear hears
 * (lib/estonian/sounds.ts), so "what did they say" is a search, not a guess.
 */
export function SayItToday({ errand, reported, unitTitle }: {
  errand: Errand;
  /** How today's went, if it was already reported. */
  reported: Outcome | null;
  unitTitle: string;
}) {
  const [answer, setAnswer] = useState<Outcome | null>(reported);
  const [heard, setHeard] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const report = (outcome: Outcome) => {
    setAnswer(outcome);
    start(async () => {
      await recordEncounter(errand.id, outcome);
      router.refresh();
    });
  };

  return (
    <Card>
      <SectionTitle hint={errand.where}>Say it today</SectionTitle>
      <p className="text-md leading-snug" style={{ color: "var(--ink)" }}>{errand.says}</p>
      <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
        The words are in <Link href={`/learn/${errand.unit}`} className="underline">{unitTitle}</Link>. Nobody will slow down for you, and that is the practice.
      </p>
      {answer ? (
        <p className="mt-3 flex items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
          <Footprints size={14} aria-hidden /> {REPLY[answer]}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="How it went">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              disabled={pending}
              onClick={() => report(o)}
              className="choice-btn rounded-full px-3 py-2 text-sm"
            >
              {OUTCOME_LABEL[o]}
            </button>
          ))}
        </div>
      )}
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); if (heard.trim()) router.push(`/dictionary?q=${encodeURIComponent(heard.trim())}`); }}
      >
        <label className="sr-only" htmlFor="heard">Something they said that you did not catch</label>
        <input
          id="heard"
          value={heard}
          onChange={(e) => setHeard(e.target.value)}
          placeholder="Something they said, as you heard it"
          className="min-w-0 flex-1 rounded-[var(--r-sm)] border px-3 py-2 text-sm"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        />
        <button type="submit" className="press tap-tint rounded-full p-2" aria-label="Look it up the way it sounded" style={{ color: "var(--ink-2)" }}>
          <Search size={16} aria-hidden />
        </button>
      </form>
    </Card>
  );
}

const REPLY: Record<Outcome, string> = {
  UNDERSTOOD: "They understood you. That is the whole point of all of this.",
  SWITCHED: "They switched. Next time, answer in Estonian anyway; most people come back.",
  BAILED: "Not today. The errand comes round again, and so does the person.",
};
