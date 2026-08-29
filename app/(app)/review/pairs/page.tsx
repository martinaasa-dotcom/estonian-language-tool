import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { contrastLetter, findQuantityPairs, longerOf, type FormRef } from "@/lib/estonian/quantity";
import { ButtonLink } from "@/components/Button";
import { Empty, Page } from "@/components/ui";
import { PairsSession, type PairQuestion } from "./PairsSession";

export const dynamic = "force-dynamic";

const ROUND = 10;

/** Readable names for the paradigm slots the seed data stores. */
const FORM_LABELS: Record<string, string> = {
  NOM_SG: "nominative", GEN_SG: "genitive", PART_SG: "partitive",
  ILL_SG_SHORT: "short illative", PART_PL: "partitive plural", GEN_PL: "genitive plural",
  INF_MA: "ma-infinitive", INF_DA: "da-infinitive",
  PRES_1SG: "present 1sg", PAST_1SG: "past 1sg", PART_TUD: "tud-participle",
};

/**
 * Minimal-pair listening.
 *
 * The pairs are found in the dictionary rather than written by hand — see
 * `lib/estonian/quantity` for why that matters — so this works on whatever
 * vocabulary the installation actually has, and grows when an Ekilex key
 * arrives.
 */
export default async function PairsPage() {
  const ownerId = await requireUserId();

  const lexemes = await prisma.lexeme.findMany({
    select: {
      id: true, lemma: true, translation: true,
      forms: { select: { value: true, formType: true, morphName: true } },
    },
    take: 2000,
  });

  const refs: FormRef[] = [];
  for (const lexeme of lexemes) {
    for (const form of lexeme.forms) {
      refs.push({
        value: form.value,
        lemma: lexeme.lemma,
        translation: lexeme.translation,
        formLabel:
          FORM_LABELS[form.formType] ??
          form.morphName ??
          form.formType.replace(/^EKILEX:/, ""),
        lexemeId: lexeme.id,
      });
    }
  }

  // ADR-016: hearing a length contrast correctly is evidence about the word, so
  // when it is already in the deck this grades the same card the daily loop
  // would. A contrast between two words the learner has never added scores
  // nothing, which is honest rather than inventing a card behind them.
  const deck = await prisma.card.findMany({
    where: { ownerId, suspended: false, lexemeId: { not: null } },
    select: { id: true, lexemeId: true, cardType: true },
    take: 2000,
  });
  const cardFor = new Map<string, string>();
  for (const c of deck) {
    if (!c.lexemeId) continue;
    const better = c.cardType === "RECOGNITION";
    if (!cardFor.has(c.lexemeId) || better) cardFor.set(c.lexemeId, c.id);
  }

  const pairs = findQuantityPairs(refs, 200);

  if (pairs.length === 0) {
    return (
      <Page title="Minimal pairs" lead="The length distinctions spelling half-records.">
        <Empty
          title="No length contrasts in the dictionary yet"
          body="These are found automatically wherever two forms differ only in how long a sound is, as in maja against majja. The built-in set is small; an Ekilex key in Settings finds many more."
          action={<ButtonLink href="/settings" variant="primary">Open Settings</ButtonLink>}
        />
      </Page>
    );
  }

  const round: PairQuestion[] = pairs
    .map((p) => ({ p, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, ROUND)
    .map(({ p }) => {
      // Which one the learner will hear, chosen here so the server decides and
      // the answer is not sitting in the client before the question is asked.
      const askA = Math.random() < 0.5;
      const heardRef = askA ? p.a : p.b;
      return {
        heard: heardRef.value,
        cardId: cardFor.get(heardRef.lexemeId) ?? null,
        options: [
          { value: p.a.value, lemma: p.a.lemma, translation: p.a.translation, formLabel: p.a.formLabel },
          { value: p.b.value, lemma: p.b.lemma, translation: p.b.translation, formLabel: p.b.formLabel },
        ],
        sameWord: p.sameWord,
        longer: longerOf(p).value,
        letter: contrastLetter(p),
      };
    });

  return <PairsSession questions={round} />;
}
