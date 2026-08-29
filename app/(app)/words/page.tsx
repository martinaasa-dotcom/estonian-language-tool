import Link from "next/link";
import { Zap } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ButtonLink } from "@/components/Button";
import { Card, Empty, Page, SectionTitle, StatTile } from "@/components/ui";
import { STATE_LABELS } from "@/lib/srs/scheduler";
import { WordsTable, type CardRow } from "./WordsTable";

export const dynamic = "force-dynamic";

export default async function WordsPage() {
  const ownerId = await requireUserId();
  const totalCards = await prisma.card.count({ where: { ownerId } });
  const [cards, counts, caseStats] = await Promise.all([
    prisma.card.findMany({
      where: { ownerId },
      orderBy: [{ suspended: "asc" }, { due: "asc" }],
      take: 400,
      include: { lexeme: { select: { lemma: true, cefr: true } } },
    }),
    prisma.card.groupBy({ by: ["state"], where: { ownerId }, _count: true }),
    weakestCases(ownerId),
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
          body="Add words from the dictionary, you get the paradigm and audio with them, or paste a list you already have from Settings."
          action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid items-start gap-4 md:grid-cols-[2fr_1fr]">
            <Card>
              <SectionTitle hint="how the deck is settling">Where your cards are</SectionTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile value={rows.length} label="Cards" tone="accent" />
                <StatTile value={byState[0] ?? 0} label="New" tone="sky" />
                <StatTile value={(byState[1] ?? 0) + (byState[3] ?? 0)} label="Learning" tone="butter" />
                <StatTile value={byState[2] ?? 0} label="Known" tone="mint" />
              </div>
              <DeckBar
                segments={[
                  { label: "New", value: byState[0] ?? 0, color: "var(--sky-ink)" },
                  { label: "Learning", value: (byState[1] ?? 0) + (byState[3] ?? 0), color: "var(--butter-ink)" },
                  { label: "Known", value: byState[2] ?? 0, color: "var(--mint-ink)" },
                ]}
              />
            </Card>

            <Card>
              <SectionTitle hint="click to drill">Weakest cases</SectionTitle>
              {caseStats.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                  Add some case-form cards and this will show which cases you keep missing.
                </p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1">
                    {caseStats.map((c) => (
                      <li key={c.case}>
                        <Link
                          href={`/review?case=${c.case}`}
                          className="flex items-center justify-between gap-3 rounded-full px-2.5 py-1.5 text-sm transition-colors hover:bg-[var(--raised)]"
                          aria-label={`Drill the ${c.case.toLowerCase()}, currently ${c.accuracy} percent`}
                        >
                          <span style={{ color: "var(--ink-2)" }}>{c.case.toLowerCase()}</span>
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-16 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
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
                  <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
                    Click a case to drill just those cards, or{" "}
                    <Link href="/review/sprint" className="inline-flex items-center gap-1" style={{ color: "var(--accent-deep)" }}>
                      <Zap size={12} aria-hidden /> try a 60-second sprint
                    </Link>.
                  </p>
                </>
              )}
            </Card>
          </div>

          <WordsTable rows={rows} />
          {totalCards > rows.length && (
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              Showing the {rows.length} cards due soonest, of {totalCards}. Use the filters or the
              search box above to find the rest.
            </p>
          )}
        </div>
      )}
    </Page>
  );
}

/**
 * One bar showing how the deck splits between new, learning and known.
 *
 * The four numbers above it are the facts; this is the shape of them — whether
 * the deck is mostly still ahead of you or mostly behind you, at a glance.
 */
function DeckBar({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) return null;

  return (
    <div className="mt-5">
      <div className="flex h-3 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
        {segments.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--ink-3)" }}>
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label} <span className="tnum" style={{ color: "var(--ink-2)" }}>{Math.round((s.value / total) * 100)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Accuracy per grammatical case — the diagnostic that turns a card box into a study plan. */
async function weakestCases(ownerId: string) {
  const reviews = await prisma.review.findMany({
    where: { targetCase: { not: null }, card: { ownerId } },
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
