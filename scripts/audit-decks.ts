/**
 * THE CARDS A DECK KEPT AFTER THE BUILDER STOPPED MAKING THEM.
 *
 * `lib/srs/cards.ts` no longer builds a CASE_FORM card whose answer spells the
 * word in the question. Estonian genuinely spells some cases like the
 * nominative: `liblikas` has the genitive `liblika`, so its seesütlev is
 * `liblika` plus `s`, which is `liblikas` again, and the same holds for
 * `kapsas`, `lusikas`, `maasikas`, `rahvas`, `taevas` and 109 more. The card
 * read `liblikas → milles? kus?` with `liblikas` on the back.
 *
 * THAT FIX ONLY SETTLES THE CARDS BUILT FROM NOW ON. A deck made before it
 * still holds them, and nothing in the app will ever take one out: it comes
 * back due, the learner reads the answer off the question, the scheduler reads
 * the pass as a recall and pushes the interval out, and the slot is spent for
 * ever on a card that asks nothing. A generator fix that leaves the rows it
 * used to write is half a fix.
 *
 * So this is the other half, and it is a command somebody runs rather than
 * anything the app does on its own, because every row it touches belongs to a
 * learner. It reports by default and names every card it would remove.
 * `--write` removes them.
 *
 * REMOVING RATHER THAN SUSPENDING, and the schema is what makes that safe.
 * `Review` has no foreign key to `Card` and carries its own `ownerId` and
 * `lexemeId`, deliberately, so deleting a card cannot cascade the history
 * away: what the learner did is kept and only the unanswerable question goes.
 * Suspending would leave it in the deck counts and on the suspended list,
 * which is a row somebody has to decide about later, about a card that can
 * never be right.
 *
 * Needs a database in DATABASE_URL. Never point it at one you are not willing
 * to write to, and read the report before passing `--write`.
 */
import { prisma } from "../lib/db";
import { acceptedAnswers } from "../lib/estonian/answer";

const write = process.argv.includes("--write");

async function main() {
  const cards = await prisma.card.findMany({
    where: { cardType: "CASE_FORM", lexemeId: { not: null } },
    select: {
      id: true, back: true, front: true, ownerId: true, targetCase: true,
      lexeme: { select: { lemma: true } },
    },
    orderBy: { id: "asc" },
  });

  const doomed: { id: string; lemma: string; back: string; targetCase: string | null }[] = [];
  const owners = new Set<string>();
  for (const card of cards) {
    const lemma = card.lexeme?.lemma;
    if (!lemma) continue;
    const spelt = new Set(acceptedAnswers(lemma, "et"));
    if (acceptedAnswers(card.back, "et").some((f) => spelt.has(f))) {
      doomed.push({ id: card.id, lemma, back: card.back, targetCase: card.targetCase });
      owners.add(card.ownerId);
    }
  }

  console.log(`Read ${cards.length} case cards.`);
  if (doomed.length === 0) {
    console.log("None of them prints its own answer.");
    return;
  }

  const cardsWord = doomed.length === 1 ? "One card asks" : `${doomed.length} cards ask`;
  const decksWord = owners.size === 1 ? "one deck" : `${owners.size} decks`;
  console.log(`${cardsWord} a case the word spells like its own lemma, in ${decksWord}:`);
  for (const d of doomed.slice(0, 40)) {
    console.log(`  ${d.lemma} → ${d.targetCase ?? "?"}  back: ${d.back}`);
  }
  if (doomed.length > 40) console.log(`  ... and ${doomed.length - 40} more`);

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
