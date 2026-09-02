import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Card, Chip, SectionTitle, StatTile } from "@/components/ui";
import { MASTERY_LABEL, MASTERY_ORDER, MASTERY_CORRECT, MASTERY_SLOTS, type Mastery } from "@/lib/srs/mastery";
import { wordsAt, type MasteredWord } from "@/lib/progress/mastery";

/**
 * WHICH WORDS ARE KNOWN, WHICH ARE NEARLY, AND WHICH KEEP GOING WRONG.
 *
 * The deck could say a word was due or not due and nothing else. This is the
 * other reading, asked for directly: a mastered list, an almost list, and a
 * needs-work list, so somebody can see what they have actually got rather than
 * only what the scheduler wants from them today.
 *
 * COUNTED IN WORDS, NOT CARDS, which is what makes it different from the deck
 * tiles above it on the same page. Those count cards and read the FSRS state,
 * so one word contributes four or five rows and "Known" means "this card's
 * interval is long". A learner does not think in cards. `masteryOf` is the
 * rule and it is about the word: five correct answers across three different
 * forms, with the most recent one right.
 *
 * The tiers open one at a time and start closed. Four lists of sixty words
 * unrolled on a page somebody opened to see a number is a wall, and the counts
 * are the part that gets read.
 */

/** A hue each, and none of them shared with another meaning on this page. */
const TONES: Record<Mastery, "mint" | "butter" | "peach" | "sky"> = {
  mastered: "mint",
  almost: "butter",
  struggling: "peach",
  learning: "sky",
};

/** What each tier means, in the learner's terms rather than the rule's. */
const EXPLAINS: Record<Mastery, string> = {
  mastered: `Right ${MASTERY_CORRECT} times across ${MASTERY_SLOTS} different forms.`,
  almost: "Coming along. A couple more forms and these are done.",
  struggling: "These keep going wrong. Worth a round of flash cards.",
  learning: "Met, but not answered enough times to say either way.",
};

export function MasteryLists({
  words,
  counts,
}: {
  words: readonly MasteredWord[];
  counts: Record<Mastery, number>;
}) {
  if (words.length === 0) return null;

  return (
    <Card>
      <SectionTitle hint="counted in words, not cards">How well each word is sticking</SectionTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {MASTERY_ORDER.map((tier) => (
          <StatTile key={tier} value={counts[tier]} label={MASTERY_LABEL[tier]} tone={TONES[tier]} />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {MASTERY_ORDER.filter((tier) => counts[tier] > 0).map((tier) => (
          <TierRow key={tier} tier={tier} words={wordsAt(words, tier)} total={counts[tier]} />
        ))}
      </div>
    </Card>
  );
}

function TierRow({ tier, words, total }: { tier: Mastery; words: MasteredWord[]; total: number }) {
  return (
    <details className="rounded-[var(--r)] border" style={{ borderColor: "var(--rule-soft)" }}>
      <summary className="tap-tint flex cursor-pointer items-center justify-between gap-3 rounded-[var(--r)] px-4 py-3">
        <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
          {MASTERY_LABEL[tier]}
        </span>
        <span className="text-xs" style={{ color: "var(--ink-3)" }}>
          {total} {total === 1 ? "word" : "words"}
        </span>
      </summary>

      <div className="px-4 pb-4">
        <p className="mb-3 text-xs" style={{ color: "var(--ink-3)" }}>{EXPLAINS[tier]}</p>
        <ul className="flex flex-wrap gap-2">
          {words.map((word) => (
            <li key={word.lexemeId}>
              {/* Straight to the entry, because the question a list like this
                  raises is "which one was that again". */}
              <Link href={`/dictionary?q=${encodeURIComponent(word.lemma)}`} className="tap-tint rounded-full">
                <Chip tone={tier === "struggling" ? "again" : tier === "mastered" ? "good" : "hard"}>
                  <span lang="et">{word.lemma}</span>
                </Chip>
              </Link>
            </li>
          ))}
        </ul>
        {total > words.length && (
          <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
            The {words.length} you have worked most, of {total}.
          </p>
        )}
      </div>
    </details>
  );
}
