import { CASES, caseByKey } from "@/lib/estonian/cases";
import { caseFits, caseQuestionFor, localCasesFor } from "@/lib/estonian/caseQuestion";
import { buildCloze, mentions, naturalSentence, nominalOpener } from "@/lib/estonian/cloze";
import { grammarTerm } from "@/lib/estonian/terms";
import { gapForms } from "@/lib/estonian/gapForms";
import { caseAnswer, stemsFrom } from "@/lib/estonian/derive";
import { derivedVerbForms, pres1sgFrom } from "@/lib/estonian/conjugate";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import type { CaseKey } from "@/lib/estonian/types";

export type CardType =
  | "RECOGNITION" | "PRODUCTION" | "CASE_FORM" | "GRADATION" | "GOVERNMENT" | "CLOZE" | "CONJUGATION";

export interface CardTypeSpec {
  readonly type: CardType;
  readonly label: string;
  readonly description: string;
  /** Selected by default when adding a word to the deck. */
  readonly defaultOn: boolean;
}

export const CARD_TYPES: readonly CardTypeSpec[] = [
  { type: "RECOGNITION", label: "Recognition", description: "Estonian → English", defaultOn: true },
  { type: "PRODUCTION", label: "Production", description: "English → Estonian", defaultOn: true },
  { type: "CASE_FORM", label: "Case form", description: "Answer a case question from the stem", defaultOn: false },
  { type: "GRADATION", label: "Gradation", description: "Strong grade → weak grade", defaultOn: false },
  { type: "GOVERNMENT", label: "Government", description: "Which case the verb takes", defaultOn: false },
  { type: "CLOZE", label: "In a sentence", description: "Fill the gap in a real Estonian sentence", defaultOn: true },
  { type: "CONJUGATION", label: "Conjugation", description: "Produce a named form of a verb", defaultOn: false },
];

/**
 * The order a word's own cards are worth meeting in.
 *
 * Every card a word generates is created in one `createMany` with one
 * `createdAt`, so ordering the new-card queue by that column leaves the cards
 * of a single word tied, and Postgres is free to return them in any order it
 * likes. That is how a learner's first sight of `juhtuma` came to be a
 * conjugation card asking for `olevik · ma`: a form of a verb whose meaning
 * the app had not told them yet.
 *
 * So the tie is broken here rather than left to the database, and the order is
 * the order a lesson teaches in: meet the word, then say it, then see it in a
 * sentence, and only then produce a named form of it. A type missing from this
 * table sorts last, which is the safe end for one nobody has thought about.
 */
const TEACHING_ORDER: readonly CardType[] = [
  "RECOGNITION", "PRODUCTION", "CLOZE", "CASE_FORM", "CONJUGATION", "GRADATION", "GOVERNMENT",
];

export function teachingRank(cardType: string): number {
  const at = TEACHING_ORDER.indexOf(cardType as CardType);
  return at === -1 ? TEACHING_ORDER.length : at;
}

/**
 * Sorts a batch of new cards so each word introduces itself before it examines
 * anybody.
 *
 * Stable within a word, and it deliberately does not reorder *across* words:
 * the queue's own ordering decided which words come first and this only settles
 * the ties inside one. Cards with no lexeme are their own group, since a
 * manually written card belongs to nothing.
 */
export function inTeachingOrder<T extends { lexemeId: string | null; cardType: string }>(cards: T[]): T[] {
  // Decorated rather than compared in place: the comparator needs each card's
  // original position, and looking that up with indexOf would be quadratic and
  // would also collapse two equal objects onto one index.
  const firstSeen = new Map<string, number>();
  const decorated = cards.map((card, i) => {
    const key = card.lexemeId ?? `#${i}`;
    if (!firstSeen.has(key)) firstSeen.set(key, i);
    return { card, i, group: firstSeen.get(key)!, rank: teachingRank(card.cardType) };
  });

  decorated.sort((a, b) => (a.group - b.group) || (a.rank - b.rank) || (a.i - b.i));
  return decorated.map((d) => d.card);
}

/**
 * The verb forms worth drilling, and what to call them.
 *
 * Eight, not sixty. These are the ones a beginner has to produce out loud in a
 * conversation; the rest of the forms are on the dictionary entry to be read,
 * not memorised. An attested form always answers first: Ekilex's, by its
 * morph code, or the seeded principal part. Where the dictionary holds only
 * the principal parts, which is every seeded verb on a deployment without a
 * key, the present, the negative, the conditional and the singular imperative
 * come from `lib/estonian/conjugate.ts`, the one rule over a stored stem that
 * was checked against every verb in the dictionary before it was allowed to
 * put a word on the back of a card. The simple past third person has no such
 * rule and stays attested-only, so a seeded verb makes seven cards and an
 * enriched one eight.
 *
 * Asked by the name a teacher asks by. Nobody stands at a whiteboard in Tallinn
 * and says "the conditional"; they say `tingiv kõneviis`, and a learner who has
 * only ever met the English name cannot follow the question. The English name
 * is on the reference page this card links back to, which is the right place
 * for a cross-reference and the wrong place for the prompt.
 */
const CONJUGATION_SLOTS: { code: string; formType?: string; label: string; negative?: boolean }[] = [
  { code: "IndPrSg1", formType: "PRES_1SG", label: "olevik · ma" },
  { code: "IndPrSg3", label: "olevik · ta" },
  { code: "IndPrPl1", label: "olevik · me" },
  // The negative is one form for every person, said after `ei`. The card
  // shows and accepts the two words together, since `loe` on its own is not
  // what anybody says.
  { code: "IndPrPs_", label: "eitus · ma ei", negative: true },
  { code: "IndIpfSg1", formType: "PAST_1SG", label: "lihtminevik · ma" },
  { code: "IndIpfSg3", label: "lihtminevik · ta" },
  { code: "KndPrSg1", label: "tingiv kõneviis · ma" },
  { code: "ImpPrSg2", label: "käskiv kõneviis · sa!" },
];

/**
 * The form for one conjugation slot: attested where the dictionary has it,
 * derived where the rule reaches, and nothing otherwise.
 */
function conjugationAnswer(lex: LexemeForCards, slot: (typeof CONJUGATION_SLOTS)[number]): string | null {
  const attested = lex.forms.find(
    (f) =>
      f.morphCode === slot.code ||
      f.formType === `EKILEX:${slot.code}` ||
      (slot.formType !== undefined && f.formType === slot.formType),
  );
  if (attested) return attested.value;
  const derived = derivedVerbForms({ lemma: lex.lemma, pres1sg: pres1sgFrom(lex.forms) })
    .find((f) => f.morphCode === slot.code);
  return derived?.value ?? null;
}

/** At most this many gap-fill cards per word: two sentences teach, eight nag. */
const MAX_CLOZE_PER_WORD = 2;

export interface LexemeForCards {
  lemma: string;
  translation: string;
  pos: string;
  /**
   * The Institute's semantic type codes, which decide whether this word is
   * drilled on `õpetajale` or on `õpetajasse`.
   *
   * Required rather than optional, which is what makes it stick: `null` says
   * the dictionary holds no classification and a caller that never asked
   * cannot satisfy the type. See `lib/estonian/caseQuestion.ts`.
   */
  semanticTypes: string | null;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  /** The raw `Lexeme.examples` JSON column; parsed defensively. */
  examples?: string | null;
  forms: { formType: string; value: string; morphCode?: string | null }[];
}

export interface GeneratedCard {
  cardType: CardType;
  front: string;
  back: string;
  hint: string | null;
  targetCase: string | null;
}

const form = (l: LexemeForCards, type: string) => l.forms.find((f) => f.formType === type)?.value;

/**
 * The cases every word is drilled on, whichever set of local ones it takes.
 *
 * `localCasesFor` supplies the other three, and which three is a fact about
 * the word rather than about its spelling: a place name in `-maa` answers with
 * `Saksamaal` and not `Saksamaas`, and a person or an animal answers with
 * `õpetajale` and `hobusele` and never with `õpetajasse` or `hobuses`. See
 * lib/estonian/caseQuestion.ts, which is the one answer all six generators
 * that pick a case now read.
 *
 * These two are asked of every word, because they are: `emaks` is how you say
 * somebody became a mother and `hobusega` is how you say you went by horse.
 */
const DRILL_CASES: readonly CaseKey[] = ["COMITATIVE", "TRANSLATIVE"];

/**
 * Builds the cards for one word. Only types the word can actually support are
 * produced — a word with no gradation gets no gradation card, a noun gets no
 * government card. Never invents content it does not have.
 */
export function generateCards(lex: LexemeForCards, types: readonly CardType[]): GeneratedCard[] {
  const out: GeneratedCard[] = [];
  const genSg = form(lex, "GEN_SG");

  /*
    What the case questions are asked of. `lex` carries the forms; this is the
    two facts `lib/estonian/caseQuestion.ts` needs off them, read once.
  */
  const subject = { lemma: lex.lemma, semanticTypes: lex.semanticTypes, nomSg: form(lex, "NOM_SG") ?? null };

  for (const type of types) {
    switch (type) {
      case "RECOGNITION":
        out.push({ cardType: type, front: lex.lemma, back: lex.translation, hint: null, targetCase: null });
        break;

      case "PRODUCTION":
        out.push({ cardType: type, front: lex.translation, back: lex.lemma, hint: lex.pos.toLowerCase(), targetCase: null });
        break;

      case "CASE_FORM": {
        if (!genSg) break;
        for (const key of [...localCasesFor(subject), ...DRILL_CASES]) {
          /*
            AND NOTHING AT ALL FOR A WORD WITH NO SINGULAR. Nineteen entries
            are headed by a plural because that is the only number the word
            has, and Ekilex records the singular of the word underneath, so
            this asked `prillid → milles?` and wanted `prillis`. `caseFits`
            refuses every case for those, the comitative included, since
            `jõuludega` is how you say it and `jõuluga` is a form of `jõul`.
          */
          if (!caseFits(key, subject)) continue;
          /*
            THE ANSWER SIDE IS WHAT THE DICTIONARY ATTESTS.

            This asked `deriveCase` for a suffix on the genitive, and for the
            illative that is the long form: the card for `tuba` had `toasse` on
            the back, and a learner typing `tuppa`, which is the form they will
            hear every day, was marked wrong and shown the card again until
            they stopped. `aeg` was drilled as `ajasse` rather than `aega`.

            Every accepted spelling goes on the back, joined the way
            `acceptedAnswers` already splits stored alternatives, so a word
            with two real illatives marks both right and teaches both.
          */
          const answer = caseAnswer(stemsFrom(lex.forms), key);
          if (!answer) continue;
          /*
            AND NOTHING TO ASK WHERE THE ANSWER IS THE WORD IN THE QUESTION.

            Estonian genuinely spells some cases like the nominative: `kallis`
            has the genitive `kalli`, so its inessive is `kalli` + `s`, which
            is `kallis` again, and the same goes for `kapsas`, `lusikas`,
            `maasikas`, `rahvas`, `taevas` and 109 others. The card read
            `kallis → milles? kus?` with `kallis` on the back, so the question
            printed its own answer: nobody can get it wrong, the scheduler
            reads every pass as a recall and pushes the interval out, and the
            slot is spent for ever on a card that asks nothing.

            ANY ACCEPTED SPELLING, NOT EVERY ONE, and that correction came from
            `npm run audit:questions` disagreeing with the first version of this
            rule. Seven words have the lemma as one of two: `voodi` has the
            short illative `voodi` and the long `voodisse`, and the marker has
            to take both, because refusing the short one is the `tuppa` fault
            pointed the other way. So the card asks `voodi → millesse? kuhu?`
            and a learner who copies the word out of the question is right. The
            pair is still the right thing to *show*, and the dictionary and the
            grammar pages still show it; what cannot happen is asking a question
            whose answer is printed in it.
          */
          const lemma = lex.lemma.trim().toLocaleLowerCase("et");
          if (answer.accepted.some((form) => form.trim().toLocaleLowerCase("et") === lemma)) continue;
          const spec = CASES.find((c) => c.key === key)!;
          out.push({
            cardType: type,
            /*
              THE QUESTION IS THE ONE THIS WORD ANSWERS.

              `spec.question` is the case's own name and names both
              interrogatives and the place adverb, which is right on a grammar
              page and wrong on a card about one word. A horse is a `kes`, so
              the card asks `kellega?`; and `kus?` is answered by the
              seesütlev and the alalütlev alike, so printing it makes the
              question ambiguous between two cases and marks a learner wrong
              for answering what was asked.
            */
            front: `${lex.lemma} → ${caseQuestionFor(spec, subject)}`,
            back: answer.accepted.join(" / "),
            hint: `${spec.et} · the ${spec.en.toLowerCase()}`,
            targetCase: key,
          });
        }
        break;
      }

      case "GRADATION": {
        // The genitive singular of a word with no singular is another word's,
        // so `jõulud → mille?` wanted `jõulu`. See `caseFits`.
        if (lex.gradation === "NONE" || !genSg || !caseFits("GENITIVE", subject)) break;
        out.push({
          cardType: type,
          front: `${lex.lemma} → ${caseQuestionFor(caseByKey("GENITIVE")!, subject)}`,
          back: genSg,
          /*
            The hint is shown before the answer, so it may not carry the
            pattern: `astmevaheldus mm : mb` over `hammas → kelle? mille?`
            hands `hamba` straight over and the card stops being a question.
            The pattern is on the entry, on the grammar page the answer links
            to, and in the chip beside the word wherever it is printed.
          */
          hint: "astmevaheldus · consonant gradation",
          targetCase: "GENITIVE",
        });
        break;
      }

      case "CONJUGATION": {
        if (lex.pos !== "VERB") break;
        for (const slot of CONJUGATION_SLOTS) {
          const value = conjugationAnswer(lex, slot);
          if (!value) continue;
          out.push({
            cardType: type,
            front: `${lex.lemma} → ${slot.label}`,
            back: slot.negative ? `ei ${value}` : value,
            hint: lex.translation,
            targetCase: null,
          });
        }
        break;
      }

      case "CLOZE": {
        // Only ever built from a sentence Ekilex recorded, by hiding a form we
        // already hold. Nothing is written — the exercise is real Estonian with
        // one word taken out (see lib/estonian/cloze.ts).
        /*
          AND ONLY FROM A SENTENCE, WHICH IS A STRONGER CLAIM THAN
          `usableExamples` MAKES.

          Ekilex records a usage against a *sense*, so what comes back under a
          headword is sometimes lexicography rather than something somebody
          said, and `usableExamples` keeps what is worth printing on a
          dictionary entry, which is the right rule for a page and the wrong
          one for a question. The mock exam and the level check have gone
          through `naturalSentence` since the day a real sitting turned three
          of these up; the deck never did, and built 95 gap-fill cards out of
          them. `Nii ____ on öelda, et ..` trails off. `Vanemametnikud on: ...
          9) ____;` is an ordinance. `Ta kannab tumedaid ____/teksasid.` leaves
          the answer standing beside the gap in its other spelling, which is
          the worst of them: the card cannot be got wrong and cannot be got
          right either.

          The opener is this word's own, which is all a card builder needs to
          know: the label pattern is a usage that names its own headword and
          then illustrates a sense the gloss beside it does not, and the
          headword here is the word the card is for.
        */
        const opener = nominalOpener(lex.pos, [lex.lemma, ...lex.forms.map((f) => f.value)]);
        const examples = usableExamples(parseExamples(lex.examples))
          .filter((e) => naturalSentence(e.et, opener));
        if (examples.length === 0) break;

        // Every spelling of the word, stored or derived, so a sentence about
        // `tuba` can be gapped on `toas` and one about `algama` on `algab`.
        // See `lib/estonian/gapForms.ts`: a derived form reaches a card only
        // by matching a word a lexicographer wrote, so the sentence is what
        // vouches for it.
        const byValue = gapForms(lex);

        let built = 0;
        for (const example of examples) {
          if (built >= MAX_CLOZE_PER_WORD) break;
          const cloze = buildCloze(example.et, [...byValue.keys()]);
          if (!cloze) continue;
          /*
            The lemma is given deliberately: this asks for the right *form*,
            not for the vocabulary, which the recognition card already tests.

            EXCEPT WHERE THE HINT WOULD BE THE ANSWER, which was 2,468 of these
            cards and 302 of the ones the course builds. Wherever the gap wants
            the dictionary form, the hint printed it a line under the gap, so
            the exercise this comment describes was not the exercise on screen.
            Dropping the card would lose a real question, since "which word goes
            in this gap, given what it means" is worth asking; what it may not
            do is hand over the string.

            So the hint falls back rather than switching: the lemma and the
            meaning, then the meaning alone, then nothing. The last step is not
            hypothetical, because a word can be spelled the same in both
            languages: `film`, `lamp`, `monument`, `trend` and `kama` all had
            their answer sitting in the English.
          */
          const asked = [`${lex.lemma}, ${lex.translation}`, lex.translation];
          const hint = asked.find((line) => !mentions(line, cloze.answer)) ?? null;
          out.push({
            cardType: type,
            front: cloze.text,
            back: cloze.answer,
            hint,
            targetCase: byValue.get(cloze.answer.toLowerCase()) ?? null,
          });
          built++;
        }
        break;
      }

      case "GOVERNMENT": {
        /*
          A VERB, BECAUSE THAT IS WHAT THE QUESTION ASKS.

          The dictionary records a government for 76 nouns and 34 adjectives as
          well: `osa` genuinely takes the partitive and the elative, and `laps`
          the genitive. Asking about one of those as though it were a verb is a
          question worded as a fact the entry does not support, and it was 110
          of the 450 cards this built. `lib/exam/paper.ts` filters this way and
          says in its own comment that the government drill always has; this
          was the third builder and the one nobody had told.

          AND THE ESTONIAN TERM LEADS, like every other card in this file. It
          read `aitama takes which case?`, which is English metalanguage on the
          front of a card whose back is a list of Estonian question words, and
          "which case" is not even the question: `aitama` takes the partitive,
          the elative *and* a `mida teha` clause, and the entry says so. The
          card asks what the verb takes and the back is what the dictionary
          answers.
        */
        if (lex.pos !== "VERB" || !lex.government) break;
        const term = grammarTerm("government");
        out.push({
          cardType: type,
          front: `${lex.lemma} → ${term?.et ?? "rektsioon"}`,
          back: lex.government,
          hint: `${term?.alsoCalled ?? "verb government"} · ${lex.translation}`,
          targetCase: null,
        });
        break;
      }
    }
  }
  return out;
}

/** Card types this word can actually support, for the add-to-deck checklist. */
export function availableCardTypes(lex: LexemeForCards): CardType[] {
  const genSg = form(lex, "GEN_SG");
  const types: CardType[] = ["RECOGNITION", "PRODUCTION"];
  if (genSg) types.push("CASE_FORM");
  if (lex.gradation !== "NONE" && genSg) types.push("GRADATION");
  if (lex.pos === "VERB" && lex.government) types.push("GOVERNMENT");
  // Offered only when they can genuinely be built: an option that silently
  // produces no cards is worse than no option.
  if (generateCards(lex, ["CONJUGATION"]).length > 0) types.push("CONJUGATION");
  if (generateCards(lex, ["CLOZE"]).length > 0) types.push("CLOZE");
  return types;
}
