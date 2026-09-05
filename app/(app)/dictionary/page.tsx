import { glossLanguageFrom } from "@/lib/collections/glossLanguage";
import { readSettings, SETTING_KEYS } from "@/lib/settings/store";
import { dictionaryLemmas } from "@/lib/dict/facts";
import { soundAlike } from "@/lib/estonian/sounds";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { searchLexemes } from "@/lib/dict/search";
import { enrichWithinDeadline, lookupAndStore } from "@/lib/dict/lookup";
import { didYouMean, knownAs as knownLemmas } from "@/lib/dict/known";
import { backfillClozeCards } from "@/lib/srs/backfill";
import { ekilexConfigured } from "@/lib/ekilex/client";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { resolveProvider } from "@/lib/tutor/provider";
import { suggestWords, type Suggestions } from "@/lib/dict/suggest";
import { readableHeadlines } from "@/lib/dict/headlines";
import { feedHost } from "@/lib/news/feed";
import { Page } from "@/components/ui";
import { DictionaryClient, type EntryView } from "./DictionaryClient";

export const metadata = { title: "Dictionary" };

export const dynamic = "force-dynamic";

/** A search is showing, so there is no row to fill and nothing to choose for it. */
const EMPTY_SUGGESTIONS: Suggestions = { label: "", source: "level", words: [] };

export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entry?: string }>;
}) {
  const ownerId = await requireUserId();
  /*
    `entry` names which of the matches to open, and exists because a lemma can
    hold more than one: `hall` is gray and also frost, and `@@unique` on
    `(lemma, pos)` is what lets both be stored.

    Without it the second one was listed under "other matches" and could not be
    opened. The chip navigated to `?q=<lemma>`, which searched the same word and
    landed on the same winning hit, so the button did nothing at all and the
    frost entry was unreachable from anywhere in the app. It is a plain id
    rather than an index, so a link keeps working when the ranking changes.
  */
  const { q = "", entry: wanted } = await searchParams;
  let hits = q ? await searchLexemes(q) : [];

  /*
    NOTHING LOCALLY, SO ASK WHICH WORD THAT SPELLING IS A FORM OF.

    The search strips a case ending to find a genitive stem and a person
    ending to find a first person, and that reaches every form the dictionary
    holds. It reaches nothing for a word the dictionary has no entry for, and
    that is where a form used to become a dead end twice over: `põhjas` is not
    a headword, so Ekilex's search answered nothing for it too, and the screen
    said nothing was found about the seesütlev of `põhi`. The forms list
    (`lib/dict/forms.ts`) says which headwords a spelling belongs to, so the
    live lookup below asks for the word rather than for the form.
  */
  const knownAs = q && hits.length === 0 ? await knownLemmas(q) : [];
  /*
    The first few and not all of them, because a spelling can belong to
    several: `koolis` is the seesütlev of `kool` and a person of `koolma`, and
    the list is ordered with the likeliest first. Each one is a query and each
    one below is a request to a free academic service, so the cap is what
    stops an ambiguous spelling costing five of each.
  */
  const WORTH_TRYING = 3;
  for (const lemma of knownAs.slice(0, WORTH_TRYING)) {
    if (hits.length > 0 || lemma === q.trim()) break;
    hits = await searchLexemes(lemma);
  }

  // Still nothing: ask Ekilex, store what comes back, and search again. The
  // second lookup of the same word never leaves the machine. The headword
  // first, since that is what Ekilex is keyed on, then the spelling as typed.
  let fetched = false;
  if (q && hits.length === 0 && ekilexConfigured()) {
    for (const wanted of [...knownAs.slice(0, WORTH_TRYING), q]) {
      const found = await lookupAndStore(ownerId, wanted);
      if (found) {
        hits = await searchLexemes(found.lemma);
        fetched = true;
        break;
      }
    }
  }

  /*
    STILL NOTHING, SO ASK WHAT THEY MIGHT HAVE HEARD.

    A search that found nothing is the commonest dead end in the app, and every
    way out of it so far assumes the learner can spell the word: add it
    yourself, or report it missing. Nobody here has only read these words.
    Somebody who heard `poiss` writes "pois", somebody who heard `padi` writes
    "pati", and the search folds diacritics and case endings and has nothing to
    say about either.

    Over the lemma list `lib/dict/facts.ts` already keeps in memory, so it is
    no query at all, and only on the path where the answer was going to be a
    dead end. See `lib/estonian/sounds.ts` for which confusions it forgives and
    which it deliberately does not.
  */
  const heard = hits.length === 0 && q ? soundAlike(q, await dictionaryLemmas()) : [];

  /*
    AND WHETHER IT IS A WORD AT ALL, WHICH IS A DIFFERENT QUESTION.

    Everything above searches the 5,363 entries this app can teach. The forms
    list is every spelling of the 164,000 headwords Ekilex holds, and it knows
    only that they exist and which word each belongs to. That is enough to
    tell three dead ends apart which used to render identically:

      - A real Estonian word the dictionary has no entry for. The screen can
        say so, which is the case that was reported: `uudishimulik` appears in
        this app's own copy and searching for it returned nothing at all.
      - A misspelling of one. Offer it.
      - Neither, in which case the blank really is the answer.

    One file read and one indexed query, and only on the path that was going
    to be a dead end.
    `soundAlike` above stays and is the better answer where it fires, because
    it knows which Estonian sounds a learner confuses; this is the wider net
    behind it, over every word rather than the ones with entries.
  */
  const known = hits.length === 0 && knownAs.length > 0;
  const spellings = hits.length === 0 && q && !known && heard.length === 0
    ? await didYouMean(q)
    : [];

  // Open the first hit straight away — searching a word and then having to click it
  // again is a wasted step when you already know what you looked up. Unless the
  // link asked for one of the others by name, which is the only way a second
  // entry for the same lemma can be opened at all.
  const opened = (wanted ? hits.find((h) => h.id === wanted) : undefined) ?? hits[0];

  // A seeded word we are about to display: upgrade it to the real forms first.
  if (opened && ekilexConfigured()) {
    const upgraded = await enrichWithinDeadline(opened.id);
    if (upgraded) {
      fetched = true;
      // The sentences that just arrived can support a gap-fill card this word
      // could not have had when it was added to the deck.
      await backfillClozeCards(ownerId, opened.id);
    }
  }

  const matchedAs = opened?.matchedAs ?? null;

  // The entry beside the three landing reads rather than before them: none of
  // the four depends on another, and on a hosted database each is a round trip.
  const [entry, total, suggestions, starred, headlines, settings] = await Promise.all([
    opened ? loadEntry(opened.id, ownerId) : Promise.resolve(null),
    prisma.lexeme.count(),
    /*
      Only for the landing view, like the starred list below it. What used to
      be here was a twelve-row window into the first forty rows of an
      alphabetical list, which is why this app spent its life offering
      `aberratsioon` to beginners. `lib/dict/suggest.ts` has the full account.
    */
    q ? Promise.resolve(EMPTY_SUGGESTIONS) : suggestWords(ownerId),
    // Starred words are only worth fetching for the landing view, which is the
    // one place they can be shown; a star that is never surfaced is a dead feature.
    q ? Promise.resolve([]) : prisma.starredWord.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { lexeme: { select: { lemma: true, translation: true } } },
    }),
    // The front page, readable, for the landing view only: the same hourly
    // fetch the suggestion row already pays for. See lib/dict/headlines.ts.
    q ? Promise.resolve([]) : readableHeadlines(),
    // Which language the meanings are printed in. Memoised for this render by
    // `readSettings`, so the entry and anything else that asks share one read.
    readSettings(ownerId, [SETTING_KEYS.glossLanguage]),
  ]);
  const glossLanguage = glossLanguageFrom(settings[SETTING_KEYS.glossLanguage]);

  return (
    <Page
      title="Dictionary"
      lead={
        ekilexConfigured()
          ? "Search any Estonian word. The forms come from Ekilex and are stored for offline use."
          : `${total} words with full principal parts, gradation and audio.`
      }
    >
      <DictionaryClient
        tutorReady={resolveProvider() !== null}
        canScan={resolveProvider() !== null}
        justFetched={fetched}
        initialQuery={q}
        hits={hits}
        heard={heard}
        known={known}
        knownAs={knownAs}
        spellings={spellings}
        glossLanguage={glossLanguage}
        openedId={opened?.id ?? null}
        entry={entry}
        matchedAs={matchedAs}
        suggestions={suggestions}
        headlines={headlines}
        feedHost={feedHost()}
        starred={starred.map((s) => ({ lemma: s.lexeme.lemma, translation: s.lexeme.translation }))}
      />
    </Page>
  );
}

async function loadEntry(id: string, ownerId: string): Promise<EntryView | null> {
  const lex = await prisma.lexeme.findUnique({
    where: { id },
    include: {
      forms: { orderBy: { orderIndex: "asc" } },
      cards: { where: { ownerId }, select: { id: true } },
      stars: { where: { ownerId }, select: { ownerId: true } },
    },
  });
  if (!lex) return null;
  return {
    id: lex.id,
    lemma: lex.lemma,
    translation: lex.translation,
    translationRu: lex.translationRu,
    translationUk: lex.translationUk,
    pos: lex.pos,
    cefr: lex.cefr,
    gradation: lex.gradation,
    gradationNote: lex.gradationNote,
    government: lex.government,
    semanticTypes: lex.semanticTypes,
    notes: lex.notes,
    definition: lex.definition,
    provenance: lex.provenance,
    inDeck: lex.cards.length > 0,
    starred: lex.stars.length > 0,
    examples: usableExamples(parseExamples(lex.examples)),
    forms: lex.forms.map((f) => ({
      formType: f.formType,
      value: f.value,
      isPrincipal: f.isPrincipal,
      morphCode: f.morphCode,
      morphName: f.morphName,
      orderIndex: f.orderIndex,
    })),
  };
}
