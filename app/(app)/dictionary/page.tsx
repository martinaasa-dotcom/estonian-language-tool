import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { searchLexemes } from "@/lib/dict/search";
import { enrichWithinDeadline, lookupAndStore } from "@/lib/dict/lookup";
import { backfillClozeCards } from "@/lib/srs/backfill";
import { ekilexConfigured } from "@/lib/ekilex/client";
import { parseExamples, usableExamples } from "@/lib/dict/examples";
import { resolveProvider } from "@/lib/tutor/provider";
import { Page } from "@/components/ui";
import { DictionaryClient, type EntryView } from "./DictionaryClient";

export const dynamic = "force-dynamic";

export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const ownerId = await requireUserId();
  const { q = "" } = await searchParams;
  let hits = q ? await searchLexemes(q) : [];

  // Nothing locally: ask Ekilex, store what comes back, and search again. The
  // second lookup of the same word never leaves the machine.
  let fetched = false;
  if (q && hits.length === 0 && ekilexConfigured()) {
    const found = await lookupAndStore(q);
    if (found) {
      hits = await searchLexemes(found.lemma);
      fetched = true;
    }
  }

  // Open the first hit straight away — searching a word and then having to click it
  // again is a wasted step when you already know what you looked up.
  // A seeded word we are about to display: upgrade it to the real paradigm first.
  if (hits[0] && ekilexConfigured()) {
    const upgraded = await enrichWithinDeadline(hits[0].id);
    if (upgraded) {
      fetched = true;
      // The sentences that just arrived can support a gap-fill card this word
      // could not have had when it was added to the deck.
      await backfillClozeCards(ownerId, hits[0].id);
    }
  }

  const entry = hits[0] ? await loadEntry(hits[0].id, ownerId) : null;
  const matchedAs = hits[0]?.matchedAs ?? null;

  const [total, suggestions, starred] = await Promise.all([
    prisma.lexeme.count(),
    q ? Promise.resolve([]) : prisma.lexeme.findMany({
      where: { pos: { in: ["NOUN", "VERB"] } },
      orderBy: { lemma: "asc" },
      take: 12,
      skip: Math.floor(Date.now() / 86400000) % 40,
      select: { lemma: true },
    }),
    // Starred words are only worth fetching for the landing view, which is the
    // one place they can be shown; a star that is never surfaced is a dead feature.
    q ? Promise.resolve([]) : prisma.starredWord.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { lexeme: { select: { lemma: true, translation: true } } },
    }),
  ]);

  return (
    <Page
      title="Dictionary"
      lead={
        ekilexConfigured()
          ? "Search any Estonian word. Paradigms come from Ekilex, the Institute of the Estonian Language, and are stored so the next lookup works offline."
          : `${total} words with full principal parts, gradation and audio. The eleven regular cases are worked out from the genitive.`
      }
    >
      <DictionaryClient
        tutorReady={resolveProvider() !== null}
        justFetched={fetched}
        initialQuery={q}
        hits={hits}
        entry={entry}
        matchedAs={matchedAs}
        suggestions={suggestions.map((s) => s.lemma)}
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
    pos: lex.pos,
    cefr: lex.cefr,
    gradation: lex.gradation,
    gradationNote: lex.gradationNote,
    government: lex.government,
    notes: lex.notes,
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
