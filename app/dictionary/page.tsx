import { prisma } from "@/lib/db";
import { searchLexemes } from "@/lib/dict/search";
import { Page } from "@/components/ui";
import { DictionaryClient, type EntryView } from "./DictionaryClient";

export const dynamic = "force-dynamic";

export default async function DictionaryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const hits = q ? await searchLexemes(q) : [];

  // Open the first hit straight away — searching a word and then having to click it
  // again is a wasted step when you already know what you looked up.
  const entry = hits[0] ? await loadEntry(hits[0].id) : null;
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
      lead={`${total} words with full principal parts, gradation and audio. The eleven regular cases are worked out from the genitive.`}
    >
      <DictionaryClient
        initialQuery={q}
        hits={hits}
        entry={entry}
        matchedAs={matchedAs}
        suggestions={suggestions.map((s) => s.lemma)}
      />
    </Page>
  );
}

async function loadEntry(id: string): Promise<EntryView | null> {
  const lex = await prisma.lexeme.findUnique({
    where: { id },
    include: { forms: true, cards: { select: { id: true } } },
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
    forms: lex.forms.map((f) => ({ formType: f.formType, value: f.value })),
  };
}
