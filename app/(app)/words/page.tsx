import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ButtonLink } from "@/components/Button";
import { Card, Empty, Page, SectionTitle, Stack, StatTile } from "@/components/ui";
import { STATE_LABELS } from "@/lib/srs/scheduler";
import { Diagnosis } from "@/components/Diagnosis";
import { WordsTable, type CardRow } from "./WordsTable";

export const metadata = { title: "My words" };

export const dynamic = "force-dynamic";

export default async function WordsPage() {
  const ownerId = await requireUserId();
  const totalCards = await prisma.card.count({ where: { ownerId } });
  /*
    Two queries, not three. The third read five thousand reviews to tally case
    accuracy for a panel Progress already draws from the same log, with its own
    copy of the arithmetic: the same learner could read two different numbers
    for one case and nothing here would disagree with either.
  */
  const [cards, counts] = await Promise.all([
    prisma.card.findMany({
      where: { ownerId },
      orderBy: [{ suspended: "asc" }, { due: "asc" }],
      take: 400,
      include: { lexeme: { select: { lemma: true, cefr: true } } },
    }),
    prisma.card.groupBy({ by: ["state"], where: { ownerId }, _count: true }),
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
        <Stack>
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
            {/*
              The weakest-case panel that used to sit beside this one has gone
              to Progress, which had the same panel drawn a third way. This page
              is the deck: what is in it and how it is settling. What the log
              says about your grammar is one link away, computed once.
            */}
            <p className="mt-4 text-sm" style={{ color: "var(--ink-3)" }}>
              Which cases keep catching you out, and what the pattern behind them is, live on{" "}
              <Link href="/progress" className="font-semibold underline underline-offset-2" style={{ color: "var(--accent-deep)" }}>
                Progress
              </Link>.
            </p>
          </Card>

          <Diagnosis ownerId={ownerId} />

          <WordsTable rows={rows} />
          {totalCards > rows.length && (
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              Showing the {rows.length} cards due soonest, of {totalCards}. Use the filters or the
              search box above to find the rest.
            </p>
          )}
        </Stack>
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
