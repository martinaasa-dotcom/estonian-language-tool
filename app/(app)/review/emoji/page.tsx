import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { shuffle } from "@/lib/random/shuffle";
import { emojiFor } from "@/lib/collections/emoji";
import { caseAnswer, stemsFrom } from "@/lib/estonian/derive";
import { CASES } from "@/lib/estonian/cases";
import { grammarTerm } from "@/lib/estonian/terms";
import { courseLevelFor } from "@/lib/progress/level";
import { bandsAround } from "@/lib/collections/levels";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { EmojiSession, type EmojiPair } from "./EmojiSession";

export const metadata = { title: "Picture match" };

export const dynamic = "force-dynamic";

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
 * so nothing is shipped and no licence is carried.
 */
export default async function EmojiPage() {
  const ownerId = await requireUserId();
  const level = await courseLevelFor(ownerId);

  /*
    THE LEARNER'S OWN CARDS FIRST, AND THAT IS WHAT MAKES THIS A PRACTICE MODE.

    Every mode grades through `gradeCard` (ADR-016) so the scheduler sees what
    was actually practised, and a round that only ever drew from the dictionary
    would be a side game with a score of its own. So the board is filled from
    the learner's own case cards wherever it can be: a matched pair is a
    recognition of that exact form, and it is graded.

    It cannot always be filled that way. Only 313 nouns carry a picture, which
    is about six percent of the dictionary, so a beginner's deck of forty words
    holds two or three of them and a board needs six. The rest come from the
    dictionary at the learner's level, and those carry no card because there is
    no card: nothing is graded for them, which is the honest answer rather than
    a row about a card that does not exist.
  */
  const deckCards = await prisma.card.findMany({
    where: {
      ownerId, suspended: false, cardType: "CASE_FORM", targetCase: { not: null },
      lexeme: { pos: "NOUN" },
    },
    orderBy: [{ due: "asc" }, { id: "asc" }],
    take: POOL,
    include: { lexeme: { select: { id: true, lemma: true } } },
  });

  const pairs: EmojiPair[] = [];
  const usedLemmas = new Set<string>();

  for (const card of shuffle(deckCards)) {
    if (pairs.length === PAIRS) break;
    const lemma = card.lexeme?.lemma;
    const emoji = lemma ? emojiFor(lemma) : undefined;
    if (!lemma || !emoji || usedLemmas.has(lemma)) continue;

    const spec = CASES.find((c) => c.key === card.targetCase);
    if (!spec) continue;

    usedLemmas.add(lemma);
    pairs.push({
      id: `card-${card.id}`,
      cardId: card.id,
      emoji,
      lemma,
      // The card's own back, which is the form the dictionary vouches for and
      // may be a pair (`tuppa / toasse`). The first is the one to print.
      form: card.back.split(" / ")[0]!.trim(),
      question: spec.question,
      caseEt: grammarTerm(spec.key)?.et ?? spec.et,
    });
  }

  /*
    Topped up from the dictionary at the learner's level, one band either side,
    which is the table every other screen bands by. Ordered because this is a
    `take`: past the cap, which words can appear would otherwise be the query
    plan's answer rather than this one.
  */
  if (pairs.length < PAIRS) {
    const rows = await prisma.lexeme.findMany({
      where: {
        pos: "NOUN",
        cefr: { in: [...bandsAround(level)] },
        lemma: { notIn: [...usedLemmas] },
      },
      orderBy: [{ cefr: "asc" }, { lemma: "asc" }, { id: "asc" }],
      take: POOL * 4,
      include: { forms: { select: { formType: true, morphCode: true, value: true } } },
    });

    /*
      Cases that decline and are worth asking. The three principal parts are
      excluded by `caseAnswer` itself, which returns null for them: they are
      stored rather than derived and the nominative is the lemma, so a tile
      reading `mis? maja` beside 🏠 would be asking nothing.
    */
    const askable = CASES.filter((c) => !c.principal);

    for (const row of shuffle(rows.filter((r) => emojiFor(r.lemma)))) {
      if (pairs.length === PAIRS) break;
      if (usedLemmas.has(row.lemma)) continue;
      const stems = stemsFrom(row.forms);

      // One case per word, drawn at random, so the same word is a different
      // question the next time it comes up.
      let picked: { form: string; key: string } | null = null;
      for (const spec of shuffle(askable)) {
        const answer = caseAnswer(stems, spec.key);
        if (answer) { picked = { form: answer.value, key: spec.key }; break; }
      }
      if (!picked) continue;

      const spec = CASES.find((c) => c.key === picked!.key)!;
      usedLemmas.add(row.lemma);
      pairs.push({
        id: `dict-${row.id}`,
        cardId: null,
        emoji: emojiFor(row.lemma)!,
        lemma: row.lemma,
        form: picked.form,
        question: spec.question,
        caseEt: grammarTerm(spec.key)?.et ?? spec.et,
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
