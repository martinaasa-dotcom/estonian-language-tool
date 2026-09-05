"use client";

import { equivalentIn, type GlossLanguage } from "@/lib/collections/glossLanguage";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Camera, Check, Plus, ScissorsLineDashed, Search, Star, TrendingUp } from "lucide-react";
import { addToDeck } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Speak, SpeakPair } from "@/components/Speak";
import { Card, Chip, Empty } from "@/components/ui";
import { buildCaseTable, shownForms, stemsFrom } from "@/lib/estonian/derive";
import { exceptionsFor } from "@/lib/estonian/exceptions";
import { WordExceptions } from "@/components/WordExceptions";
import { caseQuestionFor } from "@/lib/estonian/caseQuestion";
import { availableCardTypes, CARD_TYPES, type CardType } from "@/lib/srs/cards";
import type { Example } from "@/lib/dict/examples";
import { isPhrase } from "@/lib/dict/pos";
import { SAME_SPELLING, sameSpelling } from "@/lib/copy/values";
import { Examples } from "./Examples";
import { DerivedVerbForms, WordForms } from "./Forms";
import type { SearchHit } from "@/lib/dict/search";
import { AddWord, type WordDraft } from "./AddWord";
import { Et } from "@/components/Et";
import { StarWord } from "@/components/StarWord";
import { SuggestFix } from "@/components/SuggestFix";
import { AI_TAG, NO_VALUE } from "@/lib/copy/values";
import type { Suggestions } from "@/lib/dict/suggest";
import type { ReadableHeadline } from "@/lib/dict/headlines";
import { Headlines } from "@/components/Headlines";

export interface EntryForm {
  formType: string;
  value: string;
  isPrincipal: boolean;
  morphCode: string | null;
  morphName: string | null;
  orderIndex: number;
}

/**
 * The three facts `lib/estonian/caseQuestion.ts` needs about a word.
 *
 * Read off the entry rather than carried on it, because the nominative
 * singular is already in `forms` and a second copy of a form is a second
 * source of truth for it.
 */
function subjectOf(entry: EntryView) {
  return {
    lemma: entry.lemma,
    semanticTypes: entry.semanticTypes,
    nomSg: entry.forms.find((f) => f.formType === "NOM_SG")?.value ?? null,
  };
}

export interface EntryView {
  id: string;
  lemma: string;
  translation: string;
  /**
   * The Institute's own Russian and Ukrainian, where Ekilex recorded them.
   *
   * Not a translation this app or a model made: they come from the same
   * response as the forms and the sentences. Null on most of the built
   * expansion, which is drawn from Wiktionary and has none.
   */
  translationRu: string | null;
  translationUk: string | null;
  pos: string;
  cefr: string | null;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  /**
   * The Institute's semantic type codes, which decide which of the two sets of
   * local cases this word takes and whether it answers `kes?` or `mis?`.
   * See lib/estonian/caseQuestion.ts.
   */
  semanticTypes: string | null;
  notes: string | null;
  definition: string | null;
  provenance: string;
  inDeck: boolean;
  starred: boolean;
  examples: Example[];
  forms: EntryForm[];
}

const NOUN_PARTS = [
  ["NOM_SG", "Nominative sg", "nimetav"],
  ["GEN_SG", "Genitive sg", "omastav"],
  ["PART_SG", "Partitive sg", "osastav"],
  ["ILL_SG_SHORT", "Short illative", "lühike sisseütlev"],
  ["PART_PL", "Partitive pl", "mitmuse osastav"],
] as const;

const VERB_PARTS = [
  ["INF_MA", "ma-infinitive", "ma-tegevusnimi"],
  ["INF_DA", "da-infinitive", "da-tegevusnimi"],
  ["PRES_1SG", "Present 1sg", "olevik, ma"],
  ["PAST_1SG", "Past 1sg", "lihtminevik, ma"],
  ["PART_TUD", "tud-participle", "umbisikuline"],
] as const;

export function DictionaryClient({
  initialQuery, hits, heard, known, knownAs, spellings, openedId, entry, matchedAs, suggestions, headlines, feedHost, starred, tutorReady, justFetched, canScan, glossLanguage,
}: {
  initialQuery: string;
  /** Which language the learner asked for their meanings in. */
  glossLanguage: GlossLanguage;
  /** True when this word was pulled from Ekilex on this request. */
  justFetched?: boolean;
  hits: SearchHit[];
  /**
   * Words that sound like the query, when nothing matched it.
   *
   * Empty on every path but the dead end, because that is the only screen it
   * has anything to say on. See `lib/estonian/sounds.ts`.
   */
  heard: string[];
  /**
   * Whether Ekilex holds this word at all, from the 154,995-headword list.
   * True here means the word is real and this app simply has no entry for it,
   * which is a different sentence from "no such word".
   */
  known: boolean;
  /** The headwords the spelling is a form of, where it is one. Leads with itself where it is a headword. */
  knownAs: string[];
  /** Spellings close enough to be worth offering, when it is not a word. */
  spellings: string[];
  /**
   * Which of the hits is the one on screen. Usually the first, and not when a
   * link asked for another entry of the same lemma by name.
   */
  openedId: string | null;
  entry: EntryView | null;
  /** Set when the query was an inflected form — "inessive (seesütlev) of tuba". */
  matchedAs: string | null;
  /**
   * A dozen words worth looking up, and the line saying why these ones.
   *
   * The label is doing real work rather than decorating: the words change on
   * every visit now, and a row that changes without saying why reads as
   * random. "In the news today" earns the same twelve chips a second look.
   */
  suggestions: Suggestions;
  headlines: ReadableHeadline[];
  feedHost: string | null;
  /** Words this learner has starred — shown on the landing view. */
  starred: { lemma: string; translation: string }[];
  /** Whether Anu can be asked to translate an example sentence. */
  tutorReady: boolean;
  /**
   * Whether a page can be photographed, which needs a model configured. Offered
   * here rather than from the rail: scanning is a way of getting words *in*,
   * and this is where getting words in happens. A row in the navigation called
   * "Scan a page" sat under "Look it up", which is not what it is for.
   */
  canScan?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [pending, start] = useTransition();

  const showingEntry = entry !== null;

  const go = (q: string) => {
    setQuery(q);
    start(() => router.push(q.trim() ? `/dictionary?q=${encodeURIComponent(q.trim())}` : "/dictionary"));
  };

  /*
    Open one specific match.

    Searching the lemma again is enough for a different word and does nothing at
    all for another entry of the *same* one: the search would return the same
    list and open the same winner, so `hall` the frost was listed as an "other
    match" and could not be reached from the chip that named it. The id says
    which.
  */
  const openHit = (hit: SearchHit) => {
    setQuery(hit.lemma);
    start(() => router.push(
      `/dictionary?q=${encodeURIComponent(hit.lemma)}&entry=${encodeURIComponent(hit.id)}`,
    ));
  };

  const others = hits.filter((h) => h.id !== openedId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex-1">
          <EstonianInput
            value={query}
            onChange={setQuery}
            onEnter={() => go(query)}
            placeholder="Search Estonian or English, try tuba, or room"
            ariaLabel="Search the dictionary"
            large
            autoFocus={!initialQuery}
          />
        </div>
        <Button variant="primary" onClick={() => go(query)} disabled={pending} className="py-3">
          <Search size={16} aria-hidden /> Search
        </Button>
      </div>

      {!showingEntry && initialQuery === "" && starred.length > 0 && (
        <div>
          <p className="label-xs mb-2 flex items-center gap-1.5" style={{ color: "var(--ink-3)" }}>
            <Star size={12} aria-hidden /> Starred
            {/* A few of them here and all of them there. This row is capped and
                the page it points at is where the list lives. */}
            <Link
              href="/words/mastery"
              className="font-semibold underline underline-offset-2"
              style={{ color: "var(--accent-deep)" }}
            >
              See all
            </Link>
          </p>
          <ul className="flex flex-wrap gap-2">
            {starred.map((s) => (
              <li key={s.lemma}>
                <button
                  type="button"
                  onClick={() => go(s.lemma)}
                  className="choice-btn flex items-baseline gap-2 rounded-md border px-3 py-1.5 text-left"
                >
                  <span lang="et" className="text-base" style={{ color: "var(--ink)" }}>{s.lemma}</span>
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>{s.translation}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!showingEntry && initialQuery === "" && (
        <div className="flex flex-col gap-3">
          <AddWord />
          {canScan && (
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
              Got it on paper?{" "}
              <Link
                href="/scan"
                className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2"
                style={{ color: "var(--accent-deep)" }}
              >
                <Camera size={14} aria-hidden /> Photograph a word list
              </Link>{" "}
              and tick the words you want. Nothing is added until you do, and the picture is never
              stored.
            </p>
          )}
          {/* The other way of bringing your own Estonian in, and the reason it
              is here rather than on the practice menu: both of these turn
              something you already have into something you can study, which is
              what this page is for. */}
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>
            Reading something already?{" "}
            <Link
              href="/review/cloze"
              className="inline-flex items-center gap-1.5 font-semibold underline underline-offset-2"
              style={{ color: "var(--accent-deep)" }}
            >
              <ScissorsLineDashed size={14} aria-hidden /> Paste a passage
            </Link>{" "}
            and the words already in your deck are blanked out for you to fill back in.
          </p>
        </div>
      )}

      {!initialQuery && suggestions.words.length > 0 && (
        <div className="flex flex-col gap-2">
          <p id="try-these" className="label-xs" style={{ color: "var(--ink-3)" }}>
            {suggestions.label}
          </p>
          <ul aria-labelledby="try-these" className="flex flex-wrap gap-2">
            {suggestions.words.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => go(s)}
                  lang="et"
                  className="press rounded-full px-4 py-1.5 text-base transition-ui hover:-translate-y-px"
                  style={{ background: "var(--surface)", color: "var(--ink-2)", boxShadow: "var(--shadow-sm)" }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        THE OTHER WAY IN, FOR SOMEBODY WHO DOES NOT HAVE A WORD IN MIND.

        The suggestion row above offers three or four words and the search box
        wants one. Neither answers "which words are worth learning first",
        which is a question about the language rather than about this app, and
        `/dictionary/common` answers it by counting. It sits here rather than
        in the rail because this is the screen somebody is on when they want
        it, which is the whole of what `within` means in lib/ux/nav.ts.
      */}
      {!initialQuery && (
        <Link
          href="/dictionary/common"
          className="tap-tint flex items-center justify-between gap-3 rounded-[var(--r)] px-4 py-3"
          style={{ background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
        >
          <span className="flex items-center gap-2.5">
            <TrendingUp size={16} aria-hidden style={{ color: "var(--sky-ink)" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
              The words you will hear most
            </span>
          </span>
          <span className="text-xs" style={{ color: "var(--ink-3)" }}>a hundred of each kind</span>
        </Link>
      )}

      {!initialQuery && <Headlines headlines={headlines} host={feedHost} />}

      {initialQuery && hits.length === 0 && (
        <div className="flex flex-col gap-4">
          {/*
            THREE DEAD ENDS THAT USED TO READ THE SAME.

            "Nothing found" was the answer to a misspelling, to an English word
            and to a perfectly ordinary Estonian word this app had no entry for.
            The third is the one that was reported, and it is the one the app
            was most wrong about: `uudishimulik` appears in Kodukeel's own copy,
            and searching for it here said nothing found.

            The forms list tells them apart. It knows only which spellings
            exist and which word each is a form of, which is exactly enough.
          */}
          <Empty
            title={known
              ? (knownAs[0] && knownAs[0] !== initialQuery.trim()
                ? `${initialQuery} is a form of ${knownAs.slice(0, 3).join(", ")}`
                : `${initialQuery} is an Estonian word`)
              : `Nothing found for "${initialQuery}"`}
            body={known
              ? "It is not in the built-in dictionary yet. Add it with its genitive and it is yours straight away."
              : "The built-in dictionary covers common words to B2. Add this one with its genitive."}
          />

          {/*
            Spellings, when it is not a word at all. Held behind `heard` in the
            page, which knows which Estonian *sounds* a learner confuses and is
            the better answer where it has one; this is the wider net, over
            every headword rather than only the ones with entries.
          */}
          {spellings.length > 0 && (
            <Card>
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                No word is spelled that way. One of these is close.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {spellings.map((lemma) => (
                  <li key={lemma}>
                    <Link
                      href={`/dictionary?q=${encodeURIComponent(lemma)}`}
                      lang="et"
                      className="press inline-flex items-center rounded-full px-3.5 py-2 text-base font-semibold transition-ui hover:-translate-y-px"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                    >
                      {lemma}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {/*
            WHAT THEY MIGHT HAVE HEARD, BEFORE ANYTHING ELSE ON THIS SCREEN.

            Every other way out of this dead end assumes the learner can spell
            the word. Nobody using this app has only read these words: somebody
            who heard `poiss` writes "pois" and somebody who heard `padi`
            writes "pati", and the search folds diacritics and case endings and
            has nothing to say about either. It leads because it is the only
            one that might mean they are not at a dead end at all.
          */}
          {heard.length > 0 && (
            <Card>
              <p className="text-sm" style={{ color: "var(--ink-2)" }}>
                If you heard it rather than read it, Estonian writes some sounds two ways.
                One of these might be it.
              </p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {heard.map((lemma) => (
                  <li key={lemma}>
                    <Link
                      href={`/dictionary?q=${encodeURIComponent(lemma)}`}
                      lang="et"
                      className="press inline-flex items-center rounded-full px-3.5 py-2 text-base font-semibold transition-ui hover:-translate-y-px"
                      style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                    >
                      {lemma}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <AddWord initialLemma={initialQuery} />
          {/*
            A search that found nothing is the commonest dead end in the app,
            and until now it ended here. Adding the word yourself is the fix
            for one person; telling us it is missing is the fix for the next
            person who looks it up, and most people who meet this know the
            word exists because they are holding it on a page in front of them.
          */}
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              Sure it exists? Tell us, and it can go in the dictionary for everybody.
            </p>
            <div>
              <SuggestFix
                category="MISSING_WORD"
                lemma={initialQuery}
                trigger={`The dictionary found nothing for "${initialQuery}"`}
                label="This word is missing"
                tone="loud"
              />
            </div>
          </div>
        </div>
      )}

      {entry && (
        <>
          {justFetched && (
            <p
              className="rounded-[var(--r)] px-4 py-3 text-sm font-medium"
              style={{ background: "var(--good-soft)", color: "var(--good-ink)" }}
            >
              We got this from Ekilex and saved it. It works offline now too.
            </p>
          )}
          {matchedAs && (
            <p
              /*
                `scripts/test-polish.mjs` used to find this line by searching
                the page for " is the ", which is a phrase and not an anchor: it
                matched the moment any other copy on the entry used the same
                three words, and Playwright's strict mode then returned nothing
                at all rather than the wrong element. The suite read that as the
                explanation having gone. This is the same anchor
                `data-flash-answer` is one route over, and for the same reason.
              */
              data-matched-as=""
              className="rounded-[var(--r)] px-4 py-3 text-sm"
              style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            >
              <Et className="font-semibold">{initialQuery}</Et> is the {matchedAs}.
            </p>
          )}
          <Entry entry={entry} tutorReady={tutorReady} glossLanguage={glossLanguage} />
        </>
      )}

      {others.length > 0 && (
        <div>
          <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            {others.length} other match{others.length === 1 ? "" : "es"}
          </p>
          <ul className="flex flex-wrap gap-2">
            {others.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => openHit(h)}
                  className="press flex items-baseline gap-2 rounded-full border px-4 py-2 text-left transition-ui hover:-translate-y-px"
                  style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
                >
                  <span lang="et" className="text-base" style={{ color: "var(--ink)" }}>{h.lemma}</span>
                  {/*
                    The part of speech, but only where it is the thing telling
                    two chips apart. `hall` is grey and also frost, and both
                    chips read "hall" with a gloss beside them; where the
                    glosses are close, as they are across most of the pairs the
                    dictionary carries, the two were indistinguishable and one
                    of them looked like a rendering fault.
                  */}
                  {h.lemma === entry?.lemma && (
                    <span className="text-2xs italic" style={{ color: "var(--ink-3)" }}>
                      {h.pos.toLowerCase()}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                    {h.matchedAs ? h.matchedAs : h.translation}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Entry({ entry, tutorReady, glossLanguage }: {
  entry: EntryView;
  tutorReady: boolean;
  glossLanguage: GlossLanguage;
}) {
  const equivalent = equivalentIn(entry, glossLanguage);
  /*
    A PRONOUN DECLINES LIKE A NOUN AND WAS GETTING NO TABLE AT ALL.

    `see`, `kes` and `mina` are among the first thirty words anybody learns and
    are looked up constantly, and this screen showed them three forms and
    stopped, where `raamat` gets fourteen. The exclusion looks deliberate and
    was not: `PRONOUN` arrived as a part of speech long after this line, and
    the objection it might have been written for is about cards rather than
    tables. A card compares one answer, so a pronoun card answering `minule`
    marks `mulle` wrong, which is why the pronoun unit sets its own card types
    and builds none. A table has no such problem.

    And the forms are right, measured rather than assumed: `npm run
    audit:cases` puts every case this derives to Ekilex for every nominal in
    the dictionary, pronouns included, and every slot matches the form the
    Institute lists first. `see` gives `sellesse`, `sellel`, `nendega`; `kes`
    gives `kellele`, `kelleta`. The short forms Estonian also has (`mulle`,
    `sel`, `neis`) are parallel variants of exactly the kind `raamatuis` is,
    and they appear on an entry that has been enriched, through the retrieved
    table above. Where the entry has not been enriched, the note under the
    table says they exist rather than leaving a beginner to assume they do not.
  */
  const isNominal = entry.pos === "NOUN" || entry.pos === "ADJECTIVE" || entry.pos === "PRONOUN";
  const isVerb = entry.pos === "VERB";
  const parts = isVerb ? VERB_PARTS : NOUN_PARTS;
  const form = (t: string) => entry.forms.find((f) => f.formType === t)?.value;

  // Ekilex hands over every form, so when we have them there is nothing to
  // derive — we show the authoritative forms, including irregular plurals and the
  // parallel forms Estonian genuinely has (raamatutes / raamatuis).
  // Every form Ekilex labeled, principal parts included: the 1sg present is
  // both a principal part *and* the "ma" row of the conjugation table, and
  // leaving it out left a hole in the middle of the table.
  const retrieved = entry.forms.filter((f) => f.morphCode);

  // `stemsFrom` rather than five hand-picked slots: it reads the short
  // illative and the retrieved paradigm too, which is what keeps this table
  // from printing `toasse` over the `tuppa` sitting in the same form list.
  const table = isNominal ? buildCaseTable(stemsFrom(entry.forms)) : [];

  return (
    <Card className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 lang="et" className="text-3xl font-bold leading-none" style={{ color: "var(--ink)" }}>
              {entry.lemma}
            </h2>
            <SpeakPair text={entry.lemma} />
          </div>
          {/*
            An entry spelled the same in both languages printed its own headword
            again a line down, which reads as a rendering fault rather than as
            the fact about the word that it is. Thirty entries here, twelve of
            them taught by the course.
          */}
          <p className="mt-2 text-md" style={{ color: "var(--ink-2)" }}>
            {sameSpelling(entry.lemma, entry.translation) ? SAME_SPELLING : entry.translation}
          </p>
          {/*
            The meaning in the language the learner thinks in, where Ekilex
            recorded one. Under the English rather than instead of it: the
            English is the one gloss every entry has, and hiding it would leave
            the words with no equivalent looking like words with no meaning.
          */}
          {equivalent && (
            <p lang={glossLanguage} className="mt-1 text-md" style={{ color: "var(--ink-2)" }}>
              {equivalent}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip>{entry.pos.toLowerCase()}</Chip>
            {entry.cefr && <Chip tone="accent">{entry.cefr}</Chip>}
            {entry.gradationNote && (
              <Chip tone="hard" caseSensitive title="Consonant gradation, this is why the stem changes">
                gradation {entry.gradationNote}
              </Chip>
            )}
            {entry.provenance === "AI" && <Chip tone="again">{AI_TAG}</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StarWord lexemeId={entry.id} starred={entry.starred} label={entry.lemma} />
          <AddWord
            key={entry.id}
            edit={{
              id: entry.id,
              lemma: entry.lemma,
              translation: entry.translation,
              pos: entry.pos,
              cefr: entry.cefr,
              government: entry.government,
              forms: entry.forms,
            } satisfies WordDraft}
          />
          <AddToDeck entry={entry} />
        </div>
      </header>

      {/*
        Disagreeing with the entry, for somebody who is not going to open the
        edit form. The dictionary is shared and hand-editable, and that is the
        right tool for a typo you are certain about; this is the one for "my
        teacher says this is the wrong sense", which is a judgement somebody
        should look at before it changes what everybody reads.
      */}
      <EntryProblem entry={entry} />

      {/*
        TWO BLOCKS, EACH SAYING WHAT IT IS AND WHAT LANGUAGE IT IS IN.

        This was one unlabelled grey paragraph rendering `entry.notes`, and that
        column held two different things in two languages: the further English
        senses Wiktionary lists, and, after any live lookup, Ekilex's Estonian
        explanation, which overwrote them. So a reader met either a list of
        English meanings or a paragraph of C1 Estonian, in the same box, with no
        heading, while every other block on this page has one. And with no
        `lang`, so a screen reader said the Estonian with English sounds.

        The Estonian leads, because it is the dictionary's own definition and
        the English under it is the cross-reference, which is the order this app
        uses everywhere else.
      */}
      {entry.definition && (
        <div>
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            Seletus · what the dictionary says
          </h3>
          <p
            lang="et"
            className="rounded-[var(--r)] px-4 py-3.5 text-sm"
            style={{ background: "var(--raised)", color: "var(--ink-2)" }}
          >
            {entry.definition}
          </p>
        </div>
      )}

      {entry.notes && (
        <div>
          {/*
            WHAT IS UNDER THE HEADING DECIDES THE HEADING. For the 968 expanded
            entries that carry one, `notes` really is a list of further senses
            and "Other meanings" is exactly right. On the six A1 phrases it is a
            sentence about how the phrase is built, so `Tere hommikust!` read
            "Other meanings: elative case, literally 'from the morning'", which
            is not another meaning and is the first entry a beginner opens.
          */}
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            {isPhrase(entry.pos) ? "About this phrase" : "Other meanings"}
          </h3>
          <p className="rounded-[var(--r)] px-4 py-3.5 text-sm" style={{ background: "var(--raised)", color: "var(--ink-2)" }}>
            {entry.notes}
          </p>
        </div>
      )}

      {entry.government && (
        <div>
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            Government · rektsioon
          </h3>
          <p className="rounded-[var(--r)] px-4 py-3.5 text-base" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}>
            {entry.government}
          </p>
        </div>
      )}

      <Examples lexemeId={entry.id} examples={entry.examples} tutorReady={tutorReady} pos={entry.pos} />

      {entry.forms.length > 0 && (
        <div>
          <h3 className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>
            Principal parts, the forms you have to memorize
          </h3>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))" }}>
            {parts.map(([type, label, et]) => {
              const value = form(type);
              return (
                <div
                  key={type}
                  className="rounded-[var(--r)] px-3 py-3.5 text-center"
                  style={{ background: value ? "var(--accent-soft)" : "var(--raised)" }}
                >
                  {value ? (
                    <>
                      <span lang="et" className="block text-lg font-bold" style={{ color: "var(--accent-deep)" }}>{value}</span>
                      <Speak text={value} />
                    </>
                  ) : (
                    <span className="block text-lg" style={{ color: "var(--ink-3)" }}>{NO_VALUE}</span>
                  )}
                  {/*
                    The Estonian name leads and the English is the
                    cross-reference under it, which is the rule everywhere else
                    in this app and was the wrong way round on the one screen a
                    learner opens to look a word up. The case table two rows
                    below already did it correctly, so the entry disagreed with
                    itself: "SHORT ILLATIVE" in caps over `lühike sisseütlev`
                    in small italics is the exact layout CLAUDE.md names as the
                    fault it was written to stop.
                  */}
                  <span lang="et" className="label-xs mt-1.5 block" style={{ color: "var(--ink-3)" }}>{et}</span>
                  <span className="mt-0.5 block text-2xs italic" style={{ color: "var(--ink-3)" }}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/*
        WHERE THIS WORD BREAKS THE PATTERN, BETWEEN THE PARTS AND THE TABLE.

        The table below is headed "the rest, worked out from the genitive" and
        prints `tuppa` in the illative row, because `caseAnswer` prefers an
        attested form over the rule. Both facts are right and the page never put
        them next to each other, so a learner left with the ending `sse` and a
        form that does not have it, and no way to know which to reach for
        tomorrow. The gradation chip in the header is not that: it names an
        alternation, sits above four surprises and points at none of them.

        Computed from the forms already on the screen (`lib/estonian/exceptions.ts`),
        so this cannot drift from the table under it.
      */}
      <WordExceptions exceptions={exceptionsFor({ lemma: entry.lemma, pos: entry.pos, forms: entry.forms })} />

      {retrieved.length > 0 ? (
        <WordForms
          pos={entry.pos}
          subject={subjectOf(entry)}
          forms={retrieved.map((f) => ({ value: f.value, morphCode: f.morphCode, morphName: f.morphName }))}
        />
      ) : isVerb && form("PRES_1SG") ? (
        <DerivedVerbForms lemma={entry.lemma} forms={entry.forms} />
      ) : isNominal && form("GEN_SG") && (
        <div>
          <h3 className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>
            The rest, worked out from the genitive
          </h3>
          {/*
            Counted rather than typed, because the short illative is stored and
            not worked out: a word with one has that many fewer rows following
            the rule, and a sentence promising eleven over ten of them is the
            table arguing with itself. `tuppa` is bold in the column below for
            the same reason.
          */}
          <p className="mb-3 text-xs" style={{ color: "var(--ink-3)" }}>
            Learn <Et className="text-base" >{form("GEN_SG")}</Et> and these{" "}
            {table.filter((row) => row.origin === "DERIVED" && row.singular).length} follow as
            regular endings.
          </p>
          <div className="overflow-x-auto rounded-[var(--r)] border" style={{ borderColor: "var(--rule)" }}>
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr>
                  {["Case", "Singular", "Plural", "Answers"].map((h) => (
                    <th key={h} className="label-xs px-3 py-2.5 text-left" style={{ background: "var(--raised)", color: "var(--ink-3)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map(({ spec, singular, alsoRight, plural, origin }) => (
                  <tr key={spec.key} style={{ borderTop: "1px solid var(--rule-soft)" }}>
                    <td className="px-3 py-2" style={{ color: "var(--ink-2)" }}>
                      {/* The same way the retrieved forms give: this
                          table says what the form is, that page says when to
                          use it. It has to be here too, because a deployment
                          with no Ekilex key only ever renders this one, and
                          without the link its case table is a dead end. */}
                      <Link href={`/grammar/${spec.key.toLowerCase()}`} lang="et" className="hover:underline">
                        {spec.et}
                      </Link>
                      <span className="ml-1.5 text-2xs italic" style={{ color: "var(--ink-3)" }}>{spec.en.toLowerCase()}</span>
                    </td>
                    {/* Both illatives, where the word has both. `tuppa` and
                        `toasse` are one answer to one question and a course
                        teaches them as a pair, so printing either alone means
                        choosing which word to be wrong about. Joined with the
                        separator this app already uses for the parallel forms
                        Estonian has, which is the one `acceptedAnswers`
                        splits, so typing either half of what is on screen is
                        right. */}
                    <td lang="et" className="px-3 py-2 text-base" style={{ color: origin === "STORED" ? "var(--ink)" : "var(--ink-2)", fontWeight: origin === "STORED" ? 600 : 400 }}>
                      {singular ? shownForms({ singular, alsoRight }).join(" / ") : NO_VALUE}
                    </td>
                    <td lang="et" className="px-3 py-2 text-base" style={{ color: "var(--ink-2)" }}>
                      {plural ?? <span style={{ color: "var(--ink-3)" }}>{NO_VALUE}</span>}
                    </td>
                    <td lang="et" className="px-3 py-2 text-xs" style={{ color: "var(--ink-3)" }}>{caseQuestionFor(spec, subjectOf(entry))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* The gap has two causes and the note used to name only one. Eleven of
              the plural forms are the genitive plural plus an ending; the
              nominative plural is not an ending at all, so a word can have the
              genitive plural and still show no plural in the first row. */}
          {(!form("GEN_PL") || !form("NOM_PL")) && (
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              {!form("GEN_PL")
                ? "Most plural forms are built on the genitive plural, which isn’t stored for this word."
                : "The nominative plural isn’t stored for this word, and it isn’t an ending we could work out."}
              {" "}We leave a gap rather than guess. An invented form is worse than a gap.
            </p>
          )}
          {/* Only on a pronoun, and only where the entry has not been enriched.
              These are the forms Ekilex lists first and they are the ones a
              grammar book prints, but a beginner meeting only the long ones
              here and hearing the short ones all day deserves to be told the
              second set is not a mistake. An enriched entry shows both in the
              retrieved table above, so the sentence would be redundant there.

              It names no form, because this file may not write Estonian: the
              short forms are exactly the ones a seeded entry does not hold, so
              an example here would be one somebody typed. */}
          {entry.pos === "PRONOUN" && (
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              Pronouns also have short forms, and those are the ones you will hear most. These are
              the long ones, which is what a dictionary lists first. Both are right.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** The "this is wrong" affordance on a dictionary entry, in one place. */
function EntryProblem({ entry }: { entry: EntryView }) {
  const isVerb = entry.pos === "VERB";
  const parts = isVerb ? VERB_PARTS : NOUN_PARTS;
  const formTypes = parts
    .map(([type, label]) => ({
      formType: type as string,
      label,
      value: entry.forms.find((f) => f.formType === type)?.value ?? "",
    }))
    .filter((f) => f.value);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm" style={{ color: "var(--ink-3)" }}>
        Something wrong here?
      </p>
      <SuggestFix
        category="WRONG_MEANING"
        categories={["WRONG_MEANING", "WRONG_FORM", "WRONG_EXAMPLE", "OTHER"]}
        lemma={entry.lemma}
        lexemeId={entry.id}
        currentTranslation={entry.translation}
        formTypes={formTypes}
        examples={entry.examples.map((e) => e.et)}
        trigger={`${entry.lemma}: "${entry.translation}"`}
        label="Suggest a correction"
      />
    </div>
  );
}

function AddToDeck({ entry }: { entry: EntryView }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(entry.inDeck);
  const [pending, start] = useTransition();
  const available = availableCardTypes({
    lemma: entry.lemma, translation: entry.translation, pos: entry.pos,
    gradation: entry.gradation, gradationNote: entry.gradationNote,
    government: entry.government, semanticTypes: entry.semanticTypes, forms: entry.forms,
  });
  const [selected, setSelected] = useState<CardType[]>(
    CARD_TYPES.filter((t) => t.defaultOn && available.includes(t.type)).map((t) => t.type),
  );

  const submit = () => {
    start(async () => {
      const result = await addToDeck(entry.id, selected);
      if (result.ok) { setAdded(true); setOpen(false); }
    });
  };

  if (!open) {
    return (
      <Button variant={added ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {added ? <><Check size={15} aria-hidden /> In deck</> : <><Plus size={15} aria-hidden /> Add to deck</>}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-[var(--r-lg)] p-5 md:w-80" style={{ background: "var(--raised)" }}>
      <p className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>Which cards?</p>
      <div className="flex flex-col gap-2">
        {CARD_TYPES.filter((t) => available.includes(t.type)).map((t) => (
          <label key={t.type} className="flex cursor-pointer items-start gap-2.5 text-sm" style={{ color: "var(--ink-2)" }}>
            <input
              type="checkbox"
              checked={selected.includes(t.type)}
              onChange={(e) =>
                setSelected((s) => (e.target.checked ? [...s, t.type] : s.filter((x) => x !== t.type)))
              }
              className="mt-0.5"
            />
            <span>
              <span style={{ color: "var(--ink)" }}>{t.label}</span>
              <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{t.description}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
        <Button variant="primary" onClick={submit} disabled={pending || selected.length === 0} className="flex-1">
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
    </div>
  );
}
