"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Button } from "@/components/Button";
import { Card, Chip, SectionTitle } from "@/components/ui";
import type { FrequencyGroup } from "@/lib/collections/frequency";
import type { CommonSection } from "@/lib/progress/common";
import { addCommonWords } from "@/app/actions";

/**
 * THE HUNDRED YOU GET THE MOST OUT OF LEARNING FIRST, IN FOUR LISTS.
 *
 * Four rather than one, because a hundred nouns and a hundred verbs are two
 * different things to sit down with, and because a nominal and a verb are
 * counted differently upstream: ranking them against each other would be
 * comparing two measurements. See `scripts/build-frequency.ts`.
 *
 * The small words lead, and that is the argument the page is making. They are
 * the commonest words in the language by a long way, they are the ones a
 * course leaves until the grammar needs them, and they are what makes a
 * sentence heard on a bus turn into a sentence understood. `ei`, `et`, `ja`,
 * `kui`, `kas`, `jah` and `aga` are the first seven, and none of them is a
 * noun anybody would have thought to look up.
 *
 * Closed to start, with the counts on the summary, for the reason the mastery
 * lists are: four hundred words unrolled on a page is a wall, and the number
 * is the part that gets read first.
 */

const TITLE: Record<FrequencyGroup, string> = {
  SMALL: "The small words",
  VERB: "Verbs",
  NOUN: "Nouns",
  ADJECTIVE: "Describing words",
};

const BLURB: Record<FrequencyGroup, string> = {
  SMALL: "The joins, the answers and the ones that say how much. Every sentence has several.",
  VERB: "Shown as the dictionary shows them, in the ma-infinitive.",
  NOUN: "Counted on the dictionary form, so the order is fair between them.",
  ADJECTIVE: "What things are like, which is most of what a conversation is about.",
};

export function CommonWords({ sections }: { sections: CommonSection[] }) {
  return (
    <div className="flex flex-col gap-4">
      {sections.filter((s) => s.found > 0).map((section) => (
        <GroupCard key={section.group} section={section} />
      ))}
    </div>
  );
}

function GroupCard({ section }: { section: CommonSection }) {
  const [kept, setKept] = useState(section.kept);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const left = section.found - kept;

  function add() {
    start(async () => {
      const result = await addCommonWords(section.group);
      if (!result.ok) { setNote(result.error); return; }
      setKept(section.found);
      setNote(result.added === 0
        ? "Those were already in your deck."
        : `${result.added} ${result.added === 1 ? "card" : "cards"} added.`);
    });
  }

  return (
    <Card>
      <SectionTitle hint={`${kept} of ${section.found} in your deck`}>{TITLE[section.group]}</SectionTitle>
      <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>{BLURB[section.group]}</p>

      {left > 0 ? (
        <Button type="button" variant="primary" onClick={add} disabled={pending} className="mt-4">
          <Plus size={15} aria-hidden />
          {pending ? "Adding" : `Add the ${left} you do not have`}
        </Button>
      ) : (
        <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--mint-ink)" }}>
          <Check size={15} aria-hidden /> All of these are in your deck.
        </p>
      )}
      {note && <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>{note}</p>}

      <details className="mt-4 rounded-[var(--r)] border" style={{ borderColor: "var(--rule-soft)" }}>
        <summary className="tap-tint flex cursor-pointer items-center justify-between gap-3 rounded-[var(--r)] px-4 py-3">
          <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>See the list</span>
          <span className="text-xs" style={{ color: "var(--ink-3)" }}>{section.found} words</span>
        </summary>
        <ol className="flex flex-wrap gap-2 px-4 pb-4">
          {section.entries.map((entry) => (
            <li key={entry.lexemeId}>
              {/*
                Straight to the entry, because a list like this raises exactly
                one question per word and the dictionary is where it is
                answered. The gloss is on the chip's title rather than beside
                it: four hundred words with their English next to them is a
                page nobody reads, and the point of the list is the order.
              */}
              <Link href={`/dictionary?q=${encodeURIComponent(entry.lemma)}`} className="tap-tint rounded-full">
                <Chip tone={entry.inDeck ? "good" : "neutral"} title={entry.translation}>
                  <span lang="et">{entry.lemma}</span>
                </Chip>
              </Link>
            </li>
          ))}
        </ol>
      </details>
    </Card>
  );
}
