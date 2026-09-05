import { caseByKey } from "@/lib/estonian/cases";
import { caseFits, caseQuestionFor, localCasesFor } from "@/lib/estonian/caseQuestion";
import { BLANK, buildCloze, mentions, naturalSentence, nominalOpener } from "@/lib/estonian/cloze";
import { grammarTerm } from "@/lib/estonian/terms";
import { gapForms } from "@/lib/estonian/gapForms";
import { caseAnswer, stemsFrom } from "@/lib/estonian/derive";
import { caseIndex, readCase } from "@/lib/estonian/whichCase";
import { derivedVerbForms, pres1sgFrom } from "@/lib/estonian/conjugate";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { CONJUGATION_SLOTS, type ConjugationSlot } from "@/lib/srs/slots";
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
 *
 * The table itself is `CONJUGATION_SLOTS` in `lib/srs/slots.ts`, which is the
 * one answer to what facet of a word an answer was about. It moved rather than
 * being copied: the flash round asks for a named part of a verb on a card that
 * is not about that part, and a second table of morph codes is two tables
 * disagreeing about what `IndPrSg3` is called.
 */

/**
 * What reading a verb's forms needs, which is less than a whole entry.
 *
 * The flash round asks these same nine slots of a word the learner has already
 * met and holds no `gradation` or `examples` to hand over, and a second
 * reading of "which form is this" is a round and a card putting two different
 * answers on two screens. `LexemeForCards` satisfies it, so the card builder
 * passes itself unchanged.
 */
export interface VerbForms {
  lemma: string;
  forms: readonly { formType: string; value: string; morphCode?: string | null }[];
}

/**
 * Every spelling the dictionary holds under one Ekilex code.
 *
 * A list rather than the first, because a verb slot has parallel forms exactly
 * as a case does: the polite imperative of `ütlema` is `ütelge` and `öelge`,
 * and a card that took one of them would mark the other wrong. That is the
 * illative's rule, and `Form`'s unique key carries the value so that both rows
 * can sit under one code.
 */
export function attestedForms(lex: VerbForms, code: string, formType?: string): string[] {
  const out: string[] = [];
  for (const f of lex.forms) {
    const matches = f.morphCode === code
      || f.formType === `EKILEX:${code}`
      || (formType !== undefined && f.formType === formType);
    if (matches && !out.includes(f.value)) out.push(f.value);
  }
  return out;
}

/**
 * The form for one conjugation slot: attested where the dictionary has it,
 * derived where the rule reaches, and nothing otherwise.
 *
 * Exported because the flash round asks these same eight of a word the learner
 * has already met, and a second reading of "which form is this" is a round and
 * a card putting two different answers on two screens.
 */
export function conjugationAnswer(lex: VerbForms, slot: ConjugationSlot): string[] {
  const attested = attestedForms(lex, slot.code, slot.formType);
  if (attested.length > 0) return attested;
  const derived = derivedVerbForms({ lemma: lex.lemma, pres1sg: pres1sgFrom(lex.forms) })
    .find((f) => f.morphCode === slot.code);
  return derived ? [derived.value] : [];
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
  /**
   * Other lemmas the dictionary glosses exactly the same way.
   *
   * A production card is front `translation`, hint `pos`, back `lemma`, so two
   * entries with one gloss and one part of speech are one question with two
   * right answers, and each of their cards marks the other one wrong. The
   * dictionary ships 372 such prompts, `ja` and `ning` among them.
   *
   * `lib/collections/senses.ts` is what finds them and `lib/dict/facts.ts` is
   * what caches the answer. Empty for a word nothing shares a prompt with,
   * which is the overwhelming majority, and absent for a caller that has not
   * looked, which is the honest default: an unset field builds the card that
   * was built before rather than silently claiming a word has no synonym.
   */
  alsoAccepted?: readonly string[];
}

export interface GeneratedCard {
  cardType: CardType;
  front: string;
  back: string;
  hint: string | null;
  targetCase: string | null;
  /**
   * The conjugation slot a `CONJUGATION` card is about, and null on every other.
   *
   * Required rather than optional for the reason `illSgShort` is: a card
   * builder that has not thought about which facet of the word it is asking
   * for does not compile. It travels to `Card.slot`, and `slotOfCard` reads it
   * so a review of `loeb` is written down as `IndPrSg3` rather than as
   * "CONJUGATION", which is what let eight cards of one verb count as one
   * facet in the mastery reading.
   */
  slot: string | null;
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
 * The sentences a card may be built out of, for one word.
 *
 * `usableExamples` keeps what is worth printing on a dictionary entry, which
 * is the right rule for a page and too loose for a question: Ekilex records a
 * usage against a *sense*, so what comes back under a headword is sometimes
 * lexicography rather than something somebody said. `naturalSentence` is the
 * stronger test the mock exam and the level check have always applied, and the
 * deck did not, which is how it built gap-fills out of `Nii ____ on öelda, et
 * ..` and `Vanemametnikud on: ... 9) ____;`.
 *
 * One reader rather than two, because the gap-fill card and the case card now
 * draw from the same pool and a second copy of this is where the two stop
 * agreeing about what a sentence is. The opener is this word's own: the label
 * pattern is a usage that names its own headword and then illustrates a sense
 * the gloss beside it does not name.
 */
function naturalSentencesFor(lex: LexemeForCards) {
  const opener = nominalOpener(lex.pos, [lex.lemma, ...lex.forms.map((f) => f.value)]);
  return usableExamples(parseExamples(lex.examples)).filter((e) => naturalSentence(e.et, opener));
}

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
        out.push({ cardType: type, front: lex.lemma, back: lex.translation, hint: null, targetCase: null, slot: null });
        break;

      case "PRODUCTION": {
        /*
          EVERY WORD THIS PROMPT COULD BE ASKING FOR GOES ON THE BACK.

          The same fix the illative got, and for the same reason. `checkAnswer`
          marks against the back and `acceptedAnswers` splits it on the
          separator, so what the screen shows and what the marker takes are one
          string. Before this, a learner shown "and" who typed `ning` was marked
          wrong by `ja`'s card and shown it again until they stopped, and the
          dictionary had 372 prompts able to do that to somebody.

          The lemma leads, because it is this card's own word and the one the
          screen should teach first. The rest follow in the order the dictionary
          gives them, which `sharedPrompts` sorts, so the back does not depend
          on which entry the deck happened to build first.
        */
        const answers = [lex.lemma, ...(lex.alsoAccepted ?? []).filter((w) => w !== lex.lemma)];
        out.push({
          cardType: type,
          front: lex.translation,
          back: answers.join(" / "),
          hint: lex.pos.toLowerCase(),
          targetCase: null,
          slot: null,
        });
        break;
      }

      case "CASE_FORM": {
        /*
          A CASE IS DRILLED IN A SENTENCE THAT USES IT, OR IT IS NOT DRILLED.

          This asked `ravim → millesse? kuhu?` and took `ravimisse`, and a
          learner reported it as pointless. They were right, and the fault was
          not the wording. The card was generated from the fact that the
          morphology *permits* the form: `caseFits` asks whether the word is a
          person, `caseAnswer` asks whether a form can be built, and where both
          said yes a card existed. Nothing ever asked whether anybody says it.
          That built 23,106 case cards over 4,664 words, about five each, and
          the dictionary could show a sentence for 1,494 of them. `ravim` had
          none: no lexicographer has ever recorded a medicine being gone into,
          and the card was asking a learner to attach `sse` to a stem and
          calling it Estonian.

          A form nobody can be shown using is a form this app cannot teach. So
          the sentence is the card now, and a case with no sentence behind it
          builds nothing, which takes the deck to 996 cards over 914 words. The
          learner produces `ravimisse` because a sentence needs it, rather than
          because a label demanded it, which is the only reason anybody ever
          produces a case.

          THE SENTENCE HAS TO NAME THE CASE ON ITS OWN, TOO. `aadressi` is the
          short illative, the omastav and the osastav all at once, so gapping
          it out of a sentence where it is a genitive and labelling the card
          `sisseütlev` would teach the wrong case and write the wrong one into
          `Review.slot`, which is what `caseAccuracy` and the weakest-case
          panel are built from. `readCase` is the strict rule that already
          exists for this and it is the one read here: exactly one case, or no
          card. That is what takes 1,494 to 996, and the 498 it refuses are the
          ones nothing could have told apart.

          What this is not is a second `CLOZE`. A cloze gaps whatever form the
          sentence happens to hold; this picks the sentence *for* a case and
          carries `targetCase`, which is the column every case figure in the
          app is derived from.
        */
        const sentences = naturalSentencesFor(lex);
        if (sentences.length === 0) break;
        const stems = stemsFrom(lex.forms);
        const index = caseIndex(stems);

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
          */
          const answer = caseAnswer(stems, key);
          if (!answer) continue;
          /*
            AND NOTHING TO ASK WHERE THE ANSWER IS THE WORD IN THE QUESTION.

            Estonian genuinely spells some cases like the nominative: `kallis`
            has the genitive `kalli`, so its inessive is `kalli` + `s`, which
            is `kallis` again. Here the gap would stand in a sentence that says
            the word plainly, so the learner copies it out of the cue.
          */
          const lemma = lex.lemma.trim().toLocaleLowerCase("et");
          if (answer.accepted.some((form) => form.trim().toLocaleLowerCase("et") === lemma)) continue;

          for (const example of sentences) {
            const cloze = buildCloze(example.et, answer.accepted);
            if (!cloze) continue;
            // The sentence has to be about this case and no other.
            const verdict = readCase(index, cloze.answer);
            if (verdict.kind !== "one" || verdict.key !== key) continue;
            /*
              THE FORM THE SENTENCE USED LEADS, and the word's other spelling
              of the same case follows it, joined the way `acceptedAnswers`
              splits. Estonian has two illatives and both are right, so a
              learner who writes `toasse` where the lexicographer wrote
              `tuppa` has answered the question that was asked.
            */
            const also = answer.accepted.filter(
              (form) => form.toLocaleLowerCase("et") !== cloze.answer.toLocaleLowerCase("et"),
            );
            /*
              The cue is the word and its meaning, never the case, and never
              anything that spells the answer. Naming the case in front of a
              gap hands the ending over: `sisseütlev` beside `ravim` is
              `ravimisse` written out in two pieces. The case is on
              `targetCase`, where the reveal and the weakest-case panel read
              it, which is the same order `explainGap` takes.
            */
            const asked = [`${lex.lemma}, ${lex.translation}`, lex.translation];
            const hint = asked.find((line) => !mentions(line, cloze.answer)) ?? null;
            out.push({
              cardType: type,
              front: cloze.text,
              back: [cloze.answer, ...also].join(" / "),
              hint,
              targetCase: key,
              slot: null,
            });
            break;
          }
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
          slot: null,
        });
        break;
      }

      case "CONJUGATION": {
        /*
          A PERSON OF A VERB IS DRILLED IN A SENTENCE THAT USES IT, OR IT IS NOT
          DRILLED. The same rule the case card learned, for the same reason:
          `lugema → olevik · ta` asked for a suffix on a stem and nothing about
          it said why anybody would say `loeb`. That was 4,747 cards over 679
          verbs in the shipped dictionary, and a sentence a lexicographer wrote
          holding that very form exists for 421 of them, 252 of those the third
          person, which is the form most sentences are in.

          The negative and the singular imperative are one spelling: `loe` is
          both `ei loe` and `loe!`, and a spelling two slots claim is named by
          neither, exactly as `readCase` refuses `kohvi`. Here the sentence
          itself settles it, though, because the `ei` is in the sentence: `Ma
          ei loe` is the negative and `Loe!` is the imperative, and a
          lexicographer wrote both words. So the negative gaps `ei loe` whole,
          which is what the card's back has always been and what `eitus · ma
          ei` asks for, and the imperative refuses a token with `ei` in front
          of it. That is 232 more cards the pair alone had been hiding.

          The cue never names the slot. `olevik · ta` beside `lugema` is `loeb`
          written out in two pieces, the way `sisseütlev` beside `ravim` is
          `ravimisse`; the slot travels on `Card.slot`, where the reveal and
          the mastery reading read it.
        */
        if (lex.pos !== "VERB") break;
        const sentences = naturalSentencesFor(lex);
        if (sentences.length === 0) break;

        // Every spelling of every slot, and which slots claim it. The bare
        // spelling is what a token in a sentence is compared with; `ei` is
        // handled by looking at the sentence rather than by prefixing.
        const bySlot = new Map<string, { plain: string[]; whole: string[] }>();
        const claims = new Map<string, Set<string>>();
        for (const slot of CONJUGATION_SLOTS) {
          const values = conjugationAnswer(lex, slot);
          const also = slot.alsoCode ? attestedForms(lex, slot.alsoCode) : [];
          if (values.length === 0 && also.length === 0) continue;
          // `pole` stands on its own; `loe` needs its `ei`.
          const plain = [...values, ...also];
          const whole = [...values.map((v) => (slot.negative ? `ei ${v}` : v)), ...also];
          bySlot.set(slot.code, { plain, whole });
          for (const v of plain) {
            const key = v.toLocaleLowerCase("et");
            (claims.get(key) ?? claims.set(key, new Set()).get(key)!).add(slot.code);
          }
        }

        const pair = new Set(["IndPrPs_", "ImpPrSg2"]);
        for (const slot of CONJUGATION_SLOTS) {
          const forms = bySlot.get(slot.code);
          if (!forms) continue;
          for (const example of sentences) {
            const cloze = buildCloze(example.et, forms.plain);
            if (!cloze) continue;
            const key = cloze.answer.toLocaleLowerCase("et");
            const before = cloze.full.slice(0, cloze.index);
            const ei = /(^|[^\p{L}])ei\s+$/iu.exec(before);
            const standsAlone = (bySlot.get(slot.code)?.whole ?? []).some(
              (w) => w.toLocaleLowerCase("et") === key,
            );
            if (slot.negative && !ei && !standsAlone) continue;
            if (!slot.negative && ei) continue;
            // Any other slot still claiming the spelling, once the negative and
            // the imperative have been told apart by the `ei`, is a real
            // ambiguity and the card is not built.
            const rivals = [...(claims.get(key) ?? [])].filter(
              (code) => code !== slot.code && !(pair.has(code) && pair.has(slot.code)),
            );
            if (rivals.length > 0) continue;

            let front = cloze.text;
            let answer = cloze.answer;
            if (slot.negative && ei) {
              // Gap both words, so what the learner types is what the card's
              // back has always said: `ei loe`, never a bare `loe`.
              const start = cloze.index - (ei[0].length - (ei[1] ?? "").length);
              front = cloze.full.slice(0, start) + BLANK + cloze.full.slice(cloze.index + cloze.answer.length);
              answer = `ei ${cloze.answer}`;
            }
            const also = forms.whole.filter(
              (w) => w.toLocaleLowerCase("et") !== answer.toLocaleLowerCase("et"),
            );
            const asked = [`${lex.lemma}, ${lex.translation}`, lex.translation];
            const hint = asked.find((line) => !mentions(line, cloze.answer)) ?? null;
            out.push({
              cardType: type,
              front,
              back: [answer, ...also].join(" / "),
              hint,
              targetCase: null,
              slot: slot.code,
            });
            break;
          }
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
        const examples = naturalSentencesFor(lex);
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
            slot: null,
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
          slot: null,
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
  /*
    ASKED OF THE BUILDER, NOT OF THE MORPHOLOGY. A genitive stem is what a case
    card needs to *derive* a form and it is no longer what the card is made of:
    a case is drilled in a sentence that uses it, and most words have no such
    sentence for most cases. Left as `if (genSg)` this would advertise a case
    card on 4,664 words and build one on 914, which is the `objekt` fault — the
    unit page lists the type, no card appears, and nothing says why.
  */
  if (generateCards(lex, ["CASE_FORM"]).length > 0) types.push("CASE_FORM");
  if (lex.gradation !== "NONE" && genSg) types.push("GRADATION");
  if (lex.pos === "VERB" && lex.government) types.push("GOVERNMENT");
  // Offered only when they can genuinely be built: an option that silently
  // produces no cards is worse than no option.
  if (generateCards(lex, ["CONJUGATION"]).length > 0) types.push("CONJUGATION");
  if (generateCards(lex, ["CLOZE"]).length > 0) types.push("CLOZE");
  return types;
}
