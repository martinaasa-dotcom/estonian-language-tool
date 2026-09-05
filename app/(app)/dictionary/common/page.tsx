import { Page } from "@/components/ui";
import { requireUserId } from "@/lib/auth/session";
import { commonSections } from "@/lib/progress/common";
import { CommonWords } from "./CommonWords";
import { Empty } from "@/components/ui";
import { SuggestFix } from "@/components/SuggestFix";

export const metadata = { title: "The words you will hear most" };

export const dynamic = "force-dynamic";

/**
 * WHICH WORDS ARE WORTH LEARNING FIRST, ANSWERED BY COUNTING RATHER THAN BY
 * OPINION.
 *
 * The course teaches in themes and the dictionary holds six thousand words,
 * and neither answers the question somebody asks in their first week. This
 * does, out of a published count over a corpus of film and television
 * subtitles, gated through the dictionary so every word on the page is one the
 * app can teach. `scripts/build-frequency.ts` is the whole of how, including
 * why the source is the one with a share-alike license rather than the better
 * corpus with a non-commercial one.
 *
 * The page says which corpus, in the lead, because "the most common words in
 * Estonian" is a claim this cannot make: subtitles are dialogue, so `tere` and
 * `aitäh` rank high and the vocabulary of a newspaper leader does not. That is
 * the right corpus for somebody learning to talk to people and the page has to
 * say so rather than let a reader assume otherwise.
 */
export default async function CommonWordsPage() {
  const ownerId = await requireUserId();
  const sections = await commonSections(ownerId);
  const found = sections.reduce((sum, s) => sum + s.found, 0);

  return (
    <Page
      title="The words you will hear most"
      lead="Counted over film and television subtitles, which is the spoken language."
    >
      {found === 0 ? (
        <div className="flex flex-col gap-4">
          {/*
            A deployment seeded before the course harvest holds a few hundred
            words and can answer for almost none of these. That is a real
            state, it is fixed by a reseed, and saying so is more use than an
            empty page.
          */}
          <Empty
            title="The dictionary has not been loaded yet"
            body="These lists are drawn from it, so there is nothing to show until it is seeded."
          />
          <SuggestFix category="BROKEN" trigger="/dictionary/common found no entries in the dictionary" />
        </div>
      ) : (
        <CommonWords sections={sections} />
      )}
    </Page>
  );
}
