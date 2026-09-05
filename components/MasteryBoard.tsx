import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Card, Chip, Meter, SectionTitle, StatTile } from "@/components/ui";
import {
  MASTERY_CORRECT, MASTERY_LABEL, MASTERY_ORDER, type Mastery,
} from "@/lib/srs/mastery";
import { slotShort } from "@/lib/srs/slots";
import { wordsAt, type MasteredWord } from "@/lib/progress/mastery";

/**
 * WHERE EVERY WORD STANDS, WORD BY WORD.
 *
 * The learner asked twice for this, and the second time because the first
 * answer was a panel three cards down a page about the deck: "I dont see it
 * anywhere". A list somebody has to find is a list nobody reads, so it has a
 * page of its own, a row in the rail's own table and a link from every screen
 * that talks about mastery.
 *
 * COUNTED IN WORDS, NOT CARDS, which is what makes it different from the deck
 * box on `/words`. That counts cards and reads the FSRS state, so one word
 * contributes four or five rows and "Known" means "this card's interval is
 * long". A learner does not think in cards. `masteryOf` is the rule and it is
 * about the word.
 *
 * WHAT EACH ROW SAYS. How many correct answers, how many different forms they
 * span, and which forms those were, because "you are 60% of the way there" is
 * a number and "you have had this right in the seesütlev and the osastav" is
 * something to act on. The bar reads the smaller of the two shares, so a word
 * right eight times in one form does not show as nearly finished.
 *
 * Server-rendered: the lists are read once and nothing here is interactive
 * beyond the links, so there is nothing for a client bundle to do.
 */

/** A hue each, and none of them shared with another meaning on this page. */
const TONES: Record<Mastery, "mint" | "butter" | "peach" | "sky"> = {
  mastered: "mint",
  almost: "butter",
  struggling: "peach",
  learning: "sky",
};

const CHIPS: Record<Mastery, "good" | "hard" | "again" | "neutral"> = {
  mastered: "good",
  almost: "hard",
  struggling: "again",
  learning: "neutral",
};

/** What each tier means, in the learner's terms rather than the rule's. */
const EXPLAINS: Record<Mastery, string> = {
  mastered: `Right ${MASTERY_CORRECT} times, across the forms this word has.`,
  almost: "Coming along. A couple more forms and these are done.",
  struggling: "These keep going wrong. Flash cards is the round for them.",
  learning: "Met, but not answered enough times to say either way.",
};

export function MasteryBoard({
  words, counts,
}: { words: readonly MasteredWord[]; counts: Record<Mastery, number> }) {
  return (
    <>
      <Card>
        <SectionTitle hint="counted in words, not cards">Where your words stand</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {MASTERY_ORDER.map((tier) => (
            <StatTile key={tier} value={counts[tier]} label={MASTERY_LABEL[tier]} tone={TONES[tier]} />
          ))}
        </div>
        <p className="mt-4 text-sm" style={{ color: "var(--ink-3)" }}>
          A word is mastered once you have had it right {MASTERY_CORRECT} times in three different
          forms, or in every form it has where it has fewer.{" "}
          <Link
            href="/review/flashcards"
            className="font-semibold underline underline-offset-2"
            style={{ color: "var(--accent-deep)" }}
          >
            Flash cards
          </Link>{" "}
          asks for the forms you are missing.
        </p>
      </Card>

      {MASTERY_ORDER.filter((tier) => counts[tier] > 0).map((tier) => (
        <Tier key={tier} tier={tier} words={wordsAt(words, tier)} total={counts[tier]} />
      ))}
    </>
  );
}

function Tier({ tier, words, total }: { tier: Mastery; words: MasteredWord[]; total: number }) {
  return (
    <Card>
      <SectionTitle hint={`${total} ${total === 1 ? "word" : "words"}`}>
        {MASTERY_LABEL[tier]}
      </SectionTitle>
      <p className="text-sm" style={{ color: "var(--ink-3)" }}>{EXPLAINS[tier]}</p>

      <ul className="mt-4 flex flex-col gap-2">
        {words.map((word) => (
          <li key={word.lexemeId}>
            <Row word={word} tier={tier} />
          </li>
        ))}
      </ul>

      {total > words.length && (
        <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
          The {words.length} you have worked most, of {total}.
        </p>
      )}
    </Card>
  );
}

function Row({ word, tier }: { word: MasteredWord; tier: Mastery }) {
  const { correct, total, slots, slotsNeeded, filled, progress } = word.verdict;
  return (
    /* Straight to the entry, because the question a list like this raises is
       "which one was that again", and the entry is where every form of it is. */
    <Link
      href={`/dictionary?q=${encodeURIComponent(word.lemma)}`}
      className="lift block rounded-[var(--r)] border p-3"
      style={{ borderColor: "var(--rule-soft)", background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span lang="et" className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
          {word.lemma}
        </span>
        <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>{word.translation}</span>
      </div>

      <div className="mt-2.5">
        <Meter
          pct={Math.round(progress * 100)}
          label={`${word.lemma} toward mastered`}
          tone={`var(--${TONES[tier]}-ink)`}
          height={6}
        />
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
        <span className="tnum">{correct}</span> right of <span className="tnum">{total}</span>,
        in <span className="tnum">{slots}</span> of <span className="tnum">{slotsNeeded}</span>{" "}
        {slotsNeeded === 1 ? "form" : "different forms"}
      </p>

      {filled.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {filled.map((slot) => (
            <Chip key={slot} tone={CHIPS[tier]}>{slotShort(slot)}</Chip>
          ))}
        </div>
      )}
    </Link>
  );
}
