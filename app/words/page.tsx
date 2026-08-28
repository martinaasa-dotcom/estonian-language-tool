import Link from "next/link";
import { prisma } from "@/lib/db";
import { ButtonLink } from "@/components/Button";
import { Card, Empty, Page, Stat } from "@/components/ui";
import { STATE_LABELS } from "@/lib/srs/scheduler";
import { WordsTable, type CardRow } from "./WordsTable";

export const dynamic = "force-dynamic";

export default async function WordsPage() {
  const totalCards = await prisma.card.count();
  const [cards, counts, caseStats] = await Promise.all([
    prisma.card.findMany({
      orderBy: [{ suspended: "asc" }, { due: "asc" }],
      take: 400,
      include: { lexeme: { select: { lemma: true, cefr: true } } },
    }),
    prisma.card.groupBy({ by: ["state"], _count: true }),
    weakestCases(),
  ]);

  const rows: CardRow[] = cards.map((c) => ({
    id: c.id,
    cardType: c.cardType,
    front: c.front,
    back: c.back,
    lemma: c.lexeme?.lemma ?? null,
    cefr: c.lexeme?.cefr ?? null,
    state: c.state,
    stateLabel: STATE_LABELS[c.state] ?? "New",
    due: c.due.toISOString(),
    lapses: c.lapses,
    suspended: c.suspended,
  }));

  const byState = Object.fromEntries(counts.map((c) => [c.state, c._count]));

  return (
    <Page
      title="My words"
      lead="Everything in your deck, and how well it is sticking."
      actions={<ButtonLink href="/dictionary" variant="primary">Add words</ButtonLink>}
    >
      {rows.length === 0 ? (
        <Empty
          title="No cards yet"
          body="Add words from the dictionary — you get the paradigm and audio with them — or paste a list you already have from Settings."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <Card>
              <div className="flex flex-wrap gap-8">
                <Stat value={rows.length} label="Cards" />
                <Stat value={byState[0] ?? 0} label="New" />
                <Stat value={(byState[1] ?? 0) + (byState[3] ?? 0)} label="Learning" />
                <Stat value={byState[2] ?? 0} label="Known" tone="var(--good)" />
              </div>
            </Card>

            <Card>
              <h2 className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>Weakest cases</h2>
              {caseStats.length === 0 ? (
                <p className="text-[13.5px]" style={{ color: "var(--ink-3)" }}>
                  Add some case-form cards and this will show which cases you keep missing.
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1">
                    {caseStats.map((c) => (
                      <li key={c.case}>
                        <Link
                          href={`/review?case=${c.case}`}
                          className="flex items-center justify-between gap-3 rounded px-1.5 py-1 text-[13.5px] transition-opacity hover:opacity-70"
                          aria-label={`Drill the ${c.case.toLowerCase()}, currently ${c.accuracy} percent`}
                        >
                          <span style={{ color: "var(--ink-2)" }}>{c.case.toLowerCase()}</span>
                          <span className="flex items-center gap-2">
                            <span className="h-1.5 w-16 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
                              <span
                                className="block h-full rounded-full"
                                style={{
                                  width: `${c.accuracy}%`,
                                  background: c.accuracy >= 85 ? "var(--good)" : c.accuracy >= 65 ? "var(--hard)" : "var(--again)",
                                }}
                              />
                            </span>
                            <span className="tnum w-9 text-right" style={{ color: "var(--ink-3)" }}>{c.accuracy}%</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[12px]" style={{ color: "var(--ink-3)" }}>
                    Click a case to drill just those cards.
                  </p>
                </>
              )}
            </Card>
          </div>

          <WordsTable rows={rows} />
          {totalCards > rows.length && (
            <p className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              Showing the {rows.length} cards due soonest, of {totalCards}. Use the filters or the
              search box above to find the rest.
            </p>
          )}
        </div>
      )}
    </Page>
  );
}

/** Accuracy per grammatical case — the diagnostic that turns a card box into a study plan. */
async function weakestCases() {
  const reviews = await prisma.review.findMany({
    where: { targetCase: { not: null } },
    select: { targetCase: true, rating: true },
    take: 5000,
  });

  const tally = new Map<string, { ok: number; total: number }>();
  for (const r of reviews) {
    if (!r.targetCase) continue;
    const entry = tally.get(r.targetCase) ?? { ok: 0, total: 0 };
    entry.total++;
    if (r.rating >= 3) entry.ok++;
    tally.set(r.targetCase, entry);
  }

  return [...tally.entries()]
    .filter(([, v]) => v.total >= 3)
    .map(([c, v]) => ({ case: c, accuracy: Math.round((v.ok / v.total) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 6);
}
