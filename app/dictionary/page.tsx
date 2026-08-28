import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { searchLexemes } from "@/lib/dict/search";
import { enrichFromEkilex, lookupAndStore } from "@/lib/dict/lookup";
import { ekilexConfigured } from "@/lib/ekilex/client";
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
    const upgraded = await enrichFromEkilex(hits[0].id);
    if (upgraded) fetched = true;
  }

  const entry = hits[0] ? await loadEntry(hits[0].id, ownerId) : null;
  const matchedAs = hits[0]?.matchedAs ?? null;

  const [total, suggestions] = await Promise.all([
    prisma.lexeme.count(),
    q ? Promise.resolve([]) : prisma.lexeme.findMany({
      where: { pos: { in: ["NOUN", "VERB"] } },
      orderBy: { lemma: "asc" },
      take: 12,
      skip: Math.floor(Date.now() / 86400000) % 40,
      select: { lemma: true },
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
        justFetched={fetched}
        initialQuery={q}
        hits={hits}
        entry={entry}
        matchedAs={matchedAs}
        suggestions={suggestions.map((s) => s.lemma)}
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
