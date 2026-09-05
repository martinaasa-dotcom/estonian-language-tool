import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { shuffle } from "@/lib/random/shuffle";
import { EMOJI_LEMMAS, emojiFor } from "@/lib/collections/emoji";
import { oneEntryPerLemma } from "@/lib/dict/search";
import { caseAnswer, stemsFrom } from "@/lib/estonian/derive";
import { acceptedAnswers } from "@/lib/estonian/answer";
import { CASES } from "@/lib/estonian/cases";
import { caseFits, caseQuestionFor } from "@/lib/estonian/caseQuestion";
import { grammarTerm } from "@/lib/estonian/terms";
import { courseLevelFor } from "@/lib/progress/level";
import { bandsAround } from "@/lib/collections/levels";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { EmojiSession, type EmojiPair } from "./EmojiSession";

export const metadata = { title: "Picture match" };

export const dynamic = "force-dynamic";

/**
 * The three facts `lib/estonian/caseQuestion.ts` needs about a word, off a row.
 *
 * One reader rather than three, because this page asks about a word from the
 * deck and about a word from the dictionary and the two rows are shaped
 * differently only in what else they carry.
 */
function subjectOf(row: {
  lemma: string;
  semanticTypes: string | null;
  forms?: readonly { formType?: string; value: string }[];
}) {
  return {
    lemma: row.lemma,
    semanticTypes: row.semanticTypes,
    nomSg: row.forms?.find((f) => f.formType === undefined || f.formType === "NOM_SG")?.value ?? null,
  };
}

/** Pairs on the board. Six rather than eight, because each tile is two lines. */
const PAIRS = 6;
/** Words read before six are chosen. */
const POOL = 120;

/**
 * PICTURE MATCH: THE MEANING IS THE PICTURE, SO THE WORD CAN BE A CASE FORM.
 *
 * The visual-memory round, asked for as "matching words only to pictures... this
 * reinforces the memory of the word and keeps it very fun".
 *
 * WHAT THE PICTURE BUYS IS THE CASE. An emoji carries the meaning without a
 * word of English, and that is not only a nicety: it frees the Estonian side of
 * the pair to be something other than the dictionary form. So a tile is a
 * question word over a case form, `kus?` over `majas`, and the board is
 * Estonian throughout. A learner matching 🏠 to `majas` has to know the word
 * *and* read the ending, which is the difference between this and a
 * vocabulary round.
 *
 * Where a word's stems will not build a case, the tile is the lemma alone
 * rather than a guess. `caseAnswer` is the one function that answers "what is
 * this word in this case", it prefers an attested form over a derived one, and
 * it returns null rather than inventing (ADR-005).
 *
 * NOUNS ONLY, because `lib/collections/emoji.ts` is nouns only: a picture of a
 * thing is a picture of a noun, and the first run of that join matched
 * `helistama`, which means to telephone, against 💍. See `scripts/build-emoji.ts`.
 *
 * The emoji are characters rather than artwork, drawn by the reader's own font,
 * so nothing is shipped and no license is carried.
 */
export default async function EmojiPage() {
  const ownerId = await requireUserId();

  /*
    THE LEARNER'S OWN CARDS FIRST, AND THAT IS WHAT MAKES THIS A PRACTICE MODE.

    Every mode grades through `gradeCard` (ADR-016) so the scheduler sees what
    was actually practiced, and a round that only ever drew from the dictionary
    would be a side game with a score of its own. So the board is filled from
    the learner's own case cards wherever it can be: a matched pair is a
    recognition of that exact form, and it is graded.

    It cannot always be filled that way. Only 313 nouns carry a picture, which
    is about six percent of the dictionary, so a beginner's deck of forty words
    holds two or three of them and a board needs six. The rest come from the
    dictionary at the learner's level, and those carry no card because there is
    no card: nothing is graded for them, which is the honest answer rather than
    a row about a card that does not exist.

    ASKED AT ONCE, because the two do not need each other: the level decides
    which band the board tops up from and the deck read does not wait on it.
    On the deployment's own pooler each `await` is a round trip, so a page that
    lines them up is a round trip longer than it has to be for nothing.
  */
  const [level, deckCards] = await Promise.all([
    courseLevelFor(ownerId),
    prisma.card.findMany({
      where: {
        ownerId, suspended: false, cardType: "CASE_FORM", targetCase: { not: null },
        lexeme: { pos: "NOUN" },
      },
      orderBy: [{ due: "asc" }, { id: "asc" }],
      take: POOL,
      // `semanticTypes` so the tile can name the question this word answers:
      // a horse is a `kes`. See lib/estonian/caseQuestion.ts.
      include: {
        lexeme: {
          select: {
            id: true, lemma: true, semanticTypes: true,
            // The nominative singular, so a word that has none is not asked
            // for a singular case. See lib/estonian/caseQuestion.ts.
            forms: { where: { formType: "NOM_SG" }, select: { value: true } },
          },
        },
      },
    }),
  ]);

  const pairs: EmojiPair[] = [];
  const usedLemmas = new Set<string>();
  /*
    AND ONE PICTURE PER BOARD, WHICH IS NOT THE SAME AS ONE WORD PER BOARD.

    313 words carry a picture and there are only 249 pictures: 🏠 is both `maja`
    and `elamu`, 🚌 is `buss` and `autobuss`, 👨 is `mees`, `meesisik` and
    `meesterahvas`, and there are fifty of these. This is a *matching* board, so
    two words sharing one emoji put the same tile up twice against two different
    forms, and the learner has no way to tell which goes with which. Getting it
    wrong then marks a card they knew.

    Deduplicating on the lemma cannot see it, because the two are different
    words. It is the picture that has to be unique here, since the picture is
    the question.
  */
  const usedEmoji = new Set<string>();

  for (const card of shuffle(deckCards)) {
    if (pairs.length === PAIRS) break;
    const lemma = card.lexeme?.lemma;
    const emoji = lemma ? emojiFor(lemma) : undefined;
    if (!lemma || !emoji || usedLemmas.has(lemma) || usedEmoji.has(emoji)) continue;

    const spec = CASES.find((c) => c.key === card.targetCase);
    if (!spec) continue;

    /*
      AND NOT A CARD WHOSE ANSWER SPELLS THE WORD. `lib/srs/cards.ts` stopped
      building these, but a deck built before it did still holds them: a
      CASE_FORM card for `liblikas` in the seesütlev carries `liblikas` on its
      back, and this round's own lead promises the ending. Read off the card
      rather than rederived, through `acceptedAnswers`, which is the function
      that decides what counts as that card's answer everywhere else: it
      splits the parallel forms on the separator the app prints them with and
      flattens both sides the same way, so the board and the marker cannot
      disagree about what the card says.
    */
    const spelt = new Set(acceptedAnswers(lemma, "et"));
    if (acceptedAnswers(card.back, "et").some((f) => spelt.has(f))) continue;

    usedLemmas.add(lemma);
    usedEmoji.add(emoji);
    pairs.push({
      id: `card-${card.id}`,
      cardId: card.id,
      emoji,
      lemma,
      // The card's own back, which is the form the dictionary vouches for and
      // may be a pair (`tuppa / toasse`). The first is the one to print.
      form: card.back.split(" / ")[0]!.trim(),
      question: caseQuestionFor(spec, subjectOf(card.lexeme!)),
      caseEt: grammarTerm(spec.key)?.et ?? spec.et,
      caseKey: spec.key,
    });
  }

  /*
    Topped up from the dictionary at the learner's level, one band either side,
    which is the table every other screen bands by.

    ASKED FOR BY NAME RATHER THAN SIFTED FOR. This read the first 480 graded
    nouns in the band, every form on each, and then dropped the ones with no
    picture, which is 480 rows fetched to use six and, worse, always the same
    480: the order is the band and then the alphabet, so at B1 the 47 pictured
    nouns at the front were the whole game and the other 126 in the band could
    not come up. `EMOJI_LEMMAS` is the 313 words that have one, so the band
    narrows a list that is already small and every pictured noun in it is
    reachable. That list is the bound, which is why there is no `take` here to
    say where to cut: there is nothing to cut.
  */
  if (pairs.length < PAIRS) {
    const wanted = EMOJI_LEMMAS.filter((l) => !usedLemmas.has(l));
    const found = await prisma.lexeme.findMany({
      where: {
        pos: "NOUN",
        cefr: { in: [...bandsAround(level)] },
        lemma: { in: wanted },
      },
      orderBy: [{ cefr: "asc" }, { lemma: "asc" }, { id: "asc" }],
      include: { forms: { select: { formType: true, morphCode: true, value: true } } },
    });

    /*
      One entry per lemma, because `@@unique` is on `(lemma, pos)` and a noun
      can still be two rows: a word confirmed off a photograph sits beside the
      seeded one, with no forms behind it. `usedLemmas` would keep the second
      off the board, but only after the shuffle had already decided which of
      the two the learner gets, and the empty one answers nothing.
    */
    const rows = oneEntryPerLemma(found, wanted);

    /*
      Cases that decline and are worth asking. The three principal parts are
      excluded by `caseAnswer` itself, which returns null for them: they are
      stored rather than derived and the nominative is the lemma, so a tile
      reading `mis? maja` beside 🏠 would be asking nothing.
    */
    const askable = CASES.filter((c) => !c.principal);

    for (const row of shuffle(rows)) {
      if (pairs.length === PAIRS) break;
      const emoji = emojiFor(row.lemma)!;
      if (usedLemmas.has(row.lemma) || usedEmoji.has(emoji)) continue;
      const stems = stemsFrom(row.forms);
      const lemma = row.lemma.trim().toLocaleLowerCase("et");

      /*
        One case per word, drawn at random, so the same word is a different
        question the next time it comes up.

        AND NOT A CASE THAT SPELLS THE LEMMA. The three principal parts are
        excluded above because `mis? maja` beside a house asks nothing, and
        Estonian spells some of the other eleven the same way: `liblikas` is
        its own inessive, and so are `sipelgas`, `kotkas` and `kirves`. This
        round's own lead promises the ending, so a tile carrying none is the
        one thing it must not print. Measured on the seeded dictionary it is
        two of 1,166 case slots at A1 and eight of 1,903 at B1, so passing
        over them costs the board nothing. `lib/srs/cards.ts` skips the same
        shape by the same test, any accepted spelling rather than every one.
      */
      let picked: { form: string; key: string } | null = null;
      for (const spec of shuffle(askable)) {
        // AND NOT A LOCAL CASE THE WORD DOES NOT TAKE. 🐴 beside `hobuses` is
        // the wrong half of the language, and a picture round is full of
        // animals. See lib/estonian/caseQuestion.ts.
        if (!caseFits(spec.key, subjectOf(row))) continue;
        const answer = caseAnswer(stems, spec.key);
        if (!answer) continue;
        if (answer.accepted.some((f) => f.trim().toLocaleLowerCase("et") === lemma)) continue;
        picked = { form: answer.value, key: spec.key };
        break;
      }
      if (!picked) continue;

      const spec = CASES.find((c) => c.key === picked!.key)!;
      usedLemmas.add(row.lemma);
      usedEmoji.add(emoji);
      pairs.push({
        id: `dict-${row.id}`,
        cardId: null,
        emoji,
        lemma: row.lemma,
        form: picked.form,
        question: caseQuestionFor(spec, subjectOf(row)),
        caseEt: grammarTerm(spec.key)?.et ?? spec.et,
      caseKey: spec.key,
      });
    }
  }

  if (pairs.length < PAIRS) {
    return (
      <Page title="Picture match" lead="Match the picture to the Estonian, ending and all.">
        <Empty
          title="Not enough words with a picture yet"
          body="This round needs nouns the dictionary can build case forms for."
          action={<ButtonLink href="/practice" variant="primary">Back to practice</ButtonLink>}
        />
      </Page>
    );
  }

  return <EmojiSession pairs={pairs} />;
}
