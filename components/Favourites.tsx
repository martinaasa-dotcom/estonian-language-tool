import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Card, Chip, SectionTitle } from "@/components/ui";
import { StarWord } from "@/components/StarWord";
import { FAVOURITE_LIMIT, type Favourite } from "@/lib/progress/stars";

/**
 * THE WORDS THE LEARNER KEPT, WHICH IS THE ONE LIST ON THIS PAGE THEY WROTE
 * THEMSELVES.
 *
 * Every other list here is derived: the four tiers are `masteryOf` reading the
 * review log, and a word arrives in one of them because of how it was
 * answered. This one is a decision somebody made, one press at a time, on the
 * card the word was in front of them on. So it leads, above the counts, rather
 * than sitting under four lists of sixty words: a list somebody has to scroll
 * to find is the fault this page exists to correct, and it was reported twice
 * before the page was built.
 *
 * THE STAR IS ON EACH ROW BECAUSE THIS IS ALSO WHERE ONE COMES OFF. A list you
 * can only add to fills up and stops being a shortlist, and the row a learner
 * wants to drop is the row they are looking at.
 *
 * The star is beside the link rather than inside it: a button nested in a link
 * is neither, and a press on it would follow the link on some browsers.
 */
export function Favourites({ words, total }: { words: readonly Favourite[]; total: number }) {
  if (words.length === 0) return null;

  return (
    <Card>
      <SectionTitle hint={`${total} ${total === 1 ? "word" : "words"}`}>Favourites</SectionTitle>
      <p className="text-sm" style={{ color: "var(--ink-3)" }}>
        The words you starred, newest first. The star on any card keeps a word here.
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {words.map((word) => (
          <li
            key={word.lexemeId}
            className="flex items-center gap-2 rounded-[var(--r)] border px-3 py-2"
            style={{ borderColor: "var(--rule-soft)", background: "var(--surface)" }}
          >
            {/* Straight to the entry, because the question a list like this
                raises is "which one was that again". */}
            <Link
              href={`/dictionary?q=${encodeURIComponent(word.lemma)}`}
              className="tap-tint -mx-1 min-w-0 flex-1 rounded-[var(--r-sm)] px-1 py-1"
            >
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span lang="et" className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                  {word.lemma}
                </span>
                <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                  {word.translation}
                </span>
              </span>
            </Link>
            {word.cefr && <Chip tone="sky">{word.cefr}</Chip>}
            <StarWord lexemeId={word.lexemeId} starred label={word.lemma} />
          </li>
        ))}
      </ul>

      {total > words.length && (
        <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
          The {FAVOURITE_LIMIT} you kept most recently, of {total}.
        </p>
      )}
    </Card>
  );
}
