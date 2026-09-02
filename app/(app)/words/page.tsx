import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ButtonLink } from "@/components/Button";
import { Card, Empty, Page, SectionTitle, Stack, StatTile } from "@/components/ui";
import { STATE_LABELS } from "@/lib/srs/scheduler";
import { Diagnosis } from "@/components/Diagnosis";
import { MasteryLists } from "@/components/MasteryLists";
import { masteryCounts, masteryFor } from "@/lib/progress/mastery";
import { WordsTable, type CardRow } from "./WordsTable";

export const metadata = { title: "My words" };

export const dynamic = "force-dynamic";

export default async function WordsPage() {
  const ownerId = await requireUserId();
  /*
    Two queries, not three. The third read five thousand reviews to tally case
    accuracy for a panel Progress already draws from the same log, with its own
    copy of the arithmetic: the same learner could read two different numbers
    for one case and nothing here would disagree with either.

    The count rides beside them rather than in front: an empty deck pays for
    two cheap reads it will not show, and everybody else saves a round trip.
  */
  const [totalCards, cards, counts, mastery] = await Promise.all([
    prisma.card.count({ where: { ownerId } }),
    prisma.card.findMany({
      where: { ownerId },
      /*
        Ending on the id, because `(suspended, due)` is not a total order and
        the tie here is the whole deck rather than a corner of it: every card
        in one `addUnitsToDeck` call is written with the same `due`, so first
        run leaves 982 cards sharing both keys. Which 400 of them this table
        listed was the query plan's answer and could differ between two
        identical requests. The rows are the same rows; what changes is that
        they are the same rows twice.
      */
      orderBy: [{ suspended: "asc" }, { due: "asc" }, { id: "asc" }],
      take: 400,
      include: { lexeme: { select: { lemma: true, cefr: true } } },
    }),
    prisma.card.groupBy({ by: ["state"], where: { ownerId }, _count: true }),
    // Where every met word stands, by the one rule in lib/srs/mastery.ts. The
    // Flash cards round and the tile on Practice read the same query, so the
    // three cannot disagree about which words are done.
    masteryFor(ownerId),
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
      actions={
        <>
          {/* The other reading of this page, and the one somebody comes for
              when the question is "what do I actually know". Counted in words
              rather than cards, which is what the box below is. */}
          <ButtonLink href="/words/mastery">Where your words stand</ButtonLink>
          <ButtonLink href="/dictionary" variant="primary">Add words</ButtonLink>
        </>
      }
    >
      {rows.length === 0 ? (
        <Empty
          title="No cards yet"
          body="Add words from the dictionary and every form and the audio come with them."
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

          <MasteryLists words={mastery} counts={masteryCounts(mastery)} />

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
