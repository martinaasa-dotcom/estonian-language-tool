/**
 * THE CARDS A DECK KEPT AFTER THE BUILDER STOPPED MAKING THEM.
 *
 * Two faults, both of them the same shape. `lib/srs/cards.ts` refuses to build
 * either card now, and a generator fix settles the cards built from now on and
 * not one card already in a deck: a `Card` row carries its own front, back and
 * `targetCase`, and nothing in this app rewrites one. So it comes back due, it
 * is answered, the scheduler reads the pass as a recall and pushes the interval
 * out, and the slot is spent for ever on a question that should not be asked.
 * A generator fix that leaves the rows it used to write is half a fix.
 *
 * ONE — A CARD THAT PRINTS ITS OWN ANSWER. Estonian genuinely spells some cases
 * like the nominative: `liblikas` has the genitive `liblika`, so its seesütlev
 * is `liblika` plus `s`, which is `liblikas` again, and the same holds for
 * `kapsas`, `lusikas`, `maasikas`, `rahvas`, `taevas` and 109 more. The card
 * read `liblikas → milles? kus?` with `liblikas` on the back. Nobody can get
 * one wrong.
 *
 * TWO — A CARD ASKING A CASE THE WORD DOES NOT TAKE. Reported by a learner, on
 * the daily quest: `isa → milles? kus?` with `isas` on the back. Estonian picks
 * between two whole sets of local cases on a fact about meaning, so a room goes
 * `toas` and a father goes `isal`, and `isas` is not a way of saying anything.
 * This one is worse than the first, because the first is a card nobody can fail
 * and this is a card you can only pass by learning something untrue: somebody
 * who gets it right has learned to say `ma annan raamatu õpetajasse`, and the
 * app has contradicted the teacher whose class they are sitting in. The same
 * rule catches a word with no singular, where the form asked for belongs to
 * another word entirely (`prillid → milles?` wanting `prillis`).
 *
 * `lib/srs/retire.ts` holds the second rule, and what it asks is **is the form
 * on the back one Estonian does not use**, which is not the same question as
 * "would the builder build this". The first version of it asked the second, on
 * the argument that the audit's test and the builder's test should be one
 * function, and the production database that reported the original fault is
 * what showed the difference. `localCasesFor` reads "we do not know" as the
 * inside trio, which is the right default for a builder and backwards for a
 * deletion: on a deployment seeded before `semanticTypes` was filled, that
 * rule condemned every correct *outside* card in the database. 6,952 entries,
 * none of them classified, 318 cards named for removal, and every one of them
 * right: `isa → isale`, `õpetaja → õpetajale`, `arst → arstile`. Silence is
 * never evidence. See the header there for what counts as evidence instead.
 *
 * A COMMAND SOMEBODY RUNS, NOT SOMETHING THE APP DOES, because every row it
 * touches belongs to a learner. It reports by default and names every card it
 * would remove; `--write` removes them. `.github/workflows/audit-decks.yml` is
 * the same thing with a button on it, for an operator with a deployment and no
 * checkout.
 *
 * REMOVING RATHER THAN SUSPENDING, and the schema is what makes that safe.
 * `Review` has no foreign key to `Card` and carries its own `ownerId` and
 * `lexemeId`, deliberately, so deleting a card cannot cascade the history
 * away: what the learner did is kept and only the unanswerable question goes.
 * Suspending would leave it in the deck counts and on the suspended list,
 * which is a row somebody has to decide about later, about a card that can
 * never be right.
 *
 * THREE — A BARE ASK NO SENTENCE CAN REPLACE. `ravim → millele? kuhu?` was
 * reported as pointless by a learner: nothing on it says when anybody would
 * say `ravimile`. The builder makes a case card out of a recorded sentence now,
 * and `repairCaseFronts` in `prisma/repair.ts` rewrites the old cards into that
 * shape wherever the dictionary has a sentence naming the case, on the next
 * seed. What is left is a card the builder would not build and cannot rebuild,
 * because no lexicographer recorded the word in that case. `unsentencedCaseCards`
 * in `lib/srs/retire.ts` names those. Run the seed first, or this reports every
 * bare card that a seed would have rewritten as well as the ones it cannot.
 *
 * WHAT IT DOES NOT DO IS BUILD THE RIGHT CARD IN ITS PLACE. Adding rows to a
 * stranger's deck is a larger claim than taking an unanswerable question out
 * of it, and the word is still in the dictionary with its own entry, its own
 * case table and a button that adds it back. The same line `prisma/repair.ts`
 * draws about scheduling columns: a repair may not cost somebody progress.
 *
 * Needs a database in DATABASE_URL. Never point it at one you are not willing
 * to write to, and read the report before passing `--write`.
 */
import { prisma } from "../lib/db";
import { acceptedAnswers } from "../lib/estonian/answer";
import { retirableCaseCards, unsentencedCaseCards, type Retirement } from "../lib/srs/retire";

const write = process.argv.includes("--write");

/** What the report prints for each fault, so a reader knows which they have. */
const WHY: Record<Retirement["why"] | "prints-its-answer", string> = {
  "prints-its-answer": "the answer is the word in the question",
  "wrong-local-set": "a being, asked for an inside case nobody says",
  "no-singular": "the word has no singular, so that form is another word's",
  "no-sentence": "a bare ask, and no recorded sentence uses the word in that case",
};

async function main() {
  const cards = await prisma.card.findMany({
    where: { cardType: "CASE_FORM", lexemeId: { not: null } },
    select: {
      id: true, back: true, front: true, ownerId: true, targetCase: true,
      lexeme: {
        select: {
          lemma: true, translation: true, pos: true, semanticTypes: true,
          gradation: true, gradationNote: true, government: true, examples: true,
          forms: {
            select: { formType: true, value: true, morphCode: true },
            orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
          },
        },
      },
    },
    orderBy: { id: "asc" },
  });

  type Doomed = {
    id: string; lemma: string; back: string; targetCase: string | null;
    why: keyof typeof WHY;
  };
  const doomed: Doomed[] = [];
  const seen = new Set<string>();
  const owners = new Set<string>();

  const condemn = (row: Doomed) => {
    if (seen.has(row.id)) return;
    seen.add(row.id);
    doomed.push(row);
  };

  for (const card of cards) {
    const lemma = card.lexeme?.lemma;
    if (!lemma) continue;
    const spelt = new Set(acceptedAnswers(lemma, "et"));
    if (acceptedAnswers(card.back, "et").some((f) => spelt.has(f))) {
      condemn({
        id: card.id, lemma, back: card.back, targetCase: card.targetCase,
        why: "prints-its-answer",
      });
      owners.add(card.ownerId);
    }
  }

  /*
    The second rule over the same rows, from the module the builder reads. Run
    after the first so a card that is both is reported under the older fault,
    which is the one the report's readers already know the shape of.
  */
  const byId = new Map(cards.map((card) => [card.id, card]));
  for (const gone of retirableCaseCards(cards)) {
    condemn({
      id: gone.id,
      lemma: gone.lemma,
      back: byId.get(gone.id)?.back ?? "",
      targetCase: gone.grammCase,
      why: gone.why,
    });
    owners.add(gone.ownerId);
  }

  /*
    The third rule, last, so a card the first two already condemn is reported
    under the fault its reader knows. This one needs the whole entry, which is
    why the query above reads more than the first two need.
  */
  for (const gone of unsentencedCaseCards(cards)) {
    condemn({
      id: gone.id,
      lemma: gone.lemma,
      back: byId.get(gone.id)?.back ?? "",
      targetCase: gone.grammCase,
      why: gone.why,
    });
    owners.add(gone.ownerId);
  }

  console.log(`Read ${cards.length} case cards.`);
  if (doomed.length === 0) {
    console.log("Every one of them asks a question its word can answer.");
    return;
  }

  const cardsWord = doomed.length === 1 ? "One card cannot" : `${doomed.length} cards cannot`;
  const decksWord = owners.size === 1 ? "one deck" : `${owners.size} decks`;
  console.log(`${cardsWord} be answered, in ${decksWord}:`);
  for (const d of doomed.slice(0, 40)) {
    console.log(`  ${d.lemma} → ${d.targetCase ?? "?"}  back: ${d.back}  (${WHY[d.why]})`);
  }
  if (doomed.length > 40) console.log(`  ... and ${doomed.length - 40} more`);

  const tally = new Map<string, number>();
  for (const d of doomed) tally.set(d.why, (tally.get(d.why) ?? 0) + 1);
  console.log("");
  for (const [why, count] of tally) console.log(`  ${count} where ${WHY[why as keyof typeof WHY]}`);

  if (!write) {
    console.log("\nNothing was changed. Re-run with --write to remove them.");
    return;
  }
  const { count } = await prisma.card.deleteMany({ where: { id: { in: doomed.map((d) => d.id) } } });
  console.log(`\nRemoved ${count}. The review log is untouched: it has no relation to Card.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
