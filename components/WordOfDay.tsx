import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { BookOpen, CalendarDays, Sprout } from "lucide-react";
import { ALMANAC_SOURCE, type WordOfDay, type WordOfDayCollection } from "@/lib/progress/wordOfDay";
import { AddWordButton } from "@/components/AddWordButton";
import { Speak } from "@/components/Speak";
import { Card, Chip, SectionTitle } from "@/components/ui";

/**
 * ONE WORD A DAY, WITH A REASON, THAT THE REST OF THE APP IS NOT GOING TO SHOW
 * YOU ANYWAY.
 *
 * Every other panel on Today reports on the learner's own deck, which means
 * every other panel goes quiet on the first morning and repeats itself on the
 * four hundredth. This one comes out of the dictionary, so it works on day one,
 * and it is chosen by the date, so it is different tomorrow whatever anybody
 * did today.
 *
 * The reason is the whole panel. `pannkook` on its own is a vocabulary item and
 * gets scrolled past; `pannkook` under "Pancake Day" is a thing somebody tells
 * a friend at lunch. `lib/copy/almanac.ts` decides what today is,
 * `lib/progress/wordOfDay.ts` asks the dictionary who carries the meaning, and
 * this prints what came back.
 *
 * WHAT IT WILL NOT DO IS INVENT ONE. When the dictionary cannot meet any of the
 * day's requests the word is simply drawn, and the card says that instead of
 * dressing it up. A reason nobody can check is worse than no reason, and the
 * day the card claims pancakes over the word for a cupboard is the day nobody
 * reads it again.
 */
export function WordOfDayCard({ word, collection, className }: {
  word: WordOfDay | null;
  /**
   * What the learner has kept from this panel so far.
   *
   * A count is what turns a card you read into a card you use: somebody who has
   * kept eleven words this way opens it looking for the twelfth. It says nothing
   * at nought, because "kept 0 so far" is a scoreboard for not having started.
   */
  collection: WordOfDayCollection;
  className?: string;
}) {
  if (!word) {
    return (
      <Card className={className}>
        <SectionTitle>Word of the day</SectionTitle>
        <p className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          You have met every word this panel can offer today, which is a first. Look one up in the
          dictionary, and there will be something new here tomorrow.
        </p>
        <Link
          href="/dictionary"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: "var(--accent-deep)" }}
        >
          <BookOpen size={14} aria-hidden /> Open the dictionary
        </Link>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <SectionTitle hint={word.occasion ? word.occasion.name : "new to you"}>
        Word of the day
      </SectionTitle>

      <div className="flex flex-wrap items-center gap-2">
        <p lang="et" className="text-3xl font-bold leading-tight" style={{ color: "var(--ink)" }}>
          {word.lemma}
        </p>
        <Speak text={word.lemma} label={`Hear ${word.lemma}`} />
      </div>
      <p className="mt-1 text-base" style={{ color: "var(--ink-2)" }}>{word.translation}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Chip>{word.pos.toLowerCase()}</Chip>
        {word.cefr && <Chip tone="sky">{word.cefr}</Chip>}
        {word.gradationNote && <Chip tone="hard" caseSensitive>{word.gradationNote}</Chip>}
      </div>

      {/*
        Why this word today. An icon and a line rather than a heading, because
        it is an aside about the date and the word above it is the point.
      */}
      <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        <CalendarDays size={15} aria-hidden className="mt-0.5" style={{ color: "var(--sky-ink)" }} />
        <span>
          {word.occasion
            ? word.occasion.note
            : "Nothing special about today, so here is a word you have not met yet."}
        </span>
      </p>

      {word.example && (
        <figure className="mt-4 rounded-[var(--r)] px-3.5 py-3" style={{ background: "var(--sky-soft)" }}>
          <blockquote lang="et" className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
            {word.example.et}
          </blockquote>
          {word.example.en && (
            <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>{word.example.en}</p>
          )}
          {/*
            Where the sentence came from, said out loud. Every Estonian sentence
            in this app is one a lexicographer recorded, and a page that shows
            them without saying so is asking to be trusted rather than checked.
          */}
          <figcaption className="mt-1.5 text-2xs" style={{ color: "var(--ink-3)" }}>
            {SENTENCE_SOURCE[word.example.source] ?? UNSTAMPED}
          </figcaption>
        </figure>
      )}

      {/*
        Marked as this panel's own, which is the only reason the count below can
        exist without a column to store it in.
      */}
      <AddWordButton lexemeId={word.lexemeId} lemma={word.lemma} source={ALMANAC_SOURCE} className="mt-4" />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <Link
          href={`/dictionary?q=${encodeURIComponent(word.lemma)}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold"
          style={{ color: "var(--accent-deep)" }}
        >
          <BookOpen size={14} aria-hidden /> See the full entry
        </Link>
        {collection.kept > 0 && (
          <p className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
            <Sprout size={13} aria-hidden />
            {collection.kept} kept
            {collection.streak > 1 ? `, ${collection.streak} days running` : ""}
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Where the sentence came from, in words.
 *
 * The fallback is the one that matters, because the built expansion writes its
 * sentences without stamping a source on them and they are the majority of what
 * this card will ever show. What every branch of this says is the same claim,
 * which is the claim ADR-005 exists to make: nobody here wrote it.
 */
const SENTENCE_SOURCE: Record<string, string> = {
  EKILEX: "Sentence recorded by Ekilex",
  SEED: "Sentence from the built-in dictionary",
  USER: "Sentence added by a learner here",
};

const UNSTAMPED = "Sentence from the dictionary, not written here";
