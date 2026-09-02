import { Compass, History } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { goalsFor, historyFor, latestFor, paperFor } from "@/lib/progress/assessment";
import { PRE_A1, type Confidence, type Placement, type SkillResult } from "@/lib/assessment/types";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Empty, Page, SectionTitle, Stack } from "@/components/ui";
import { AssessmentRunner } from "@/components/assessment/AssessmentRunner";
import { PlanPanel, levelLabel } from "@/components/assessment/PlanPanel";
import { ResultPanel } from "@/components/assessment/ResultPanel";
import { learnerDayClock } from "@/lib/progress/dayClock";
import { DATE_AND_TIME, DateText } from "@/components/DateText";

export const metadata = { title: "Level check" };

export const dynamic = "force-dynamic";

/**
 * The level check: where you are, measured rather than guessed.
 *
 * Two screens behind one route. Without `?take=1` it is the hub: your last
 * result, what it means for the goal you set, and every previous result so the
 * line can be seen moving. With it, the paper is built and sat.
 *
 * Building the paper is the expensive half, so it happens only when a check is
 * actually being taken. The hub reads three small rows.
 */
export default async function AssessPage({
  searchParams,
}: {
  searchParams: Promise<{ take?: string }>;
}) {
  const ownerId = await requireUserId();
  const { take } = await searchParams;

  if (take) {
    // A different seed every sitting, so a second attempt is a second test
    // rather than the same paper with the answers remembered.
    const paper = await paperFor(ownerId, Date.now() % 1_000_000);
    if (paper.items.length === 0) {
      return (
        <Page title="Level check" lead="Reading, listening, writing and speaking, measured against the dictionary.">
          <Empty
            title="No questions could be built"
            body="Questions come from dictionary entries that have a level set, and there are none yet."
            action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
          />
        </Page>
      );
    }
    return <AssessmentRunner items={paper.items} missing={paper.missing} />;
  }

  const [latest, history, goals, clock] = await Promise.all([
    latestFor(ownerId),
    historyFor(ownerId, 10),
    goalsFor(ownerId),
    learnerDayClock(ownerId),
  ]);

  const result: Placement | null = latest
    ? {
        skills: latest.skills as SkillResult[],
        overall: (latest.overall ?? null) as Placement["overall"],
        ceiling: (latest.ceiling ?? null) as Placement["ceiling"],
        confidence: latest.confidence as Confidence,
        itemsAnswered: latest.answered,
        /*
          A stored sitting knows how many questions it asked and not how many
          of them settled the boundary, and `Assessment` is append-only, so a
          row written before that number existed cannot grow one. Nought is the
          honest value and the panel reads it as "say nothing", the same way
          `parseDetail` reads an old row's missing breakdown as no breakdown.
          Rebuilding it here would mean recomputing a level from responses this
          row does not keep.
        */
        decisive: 0,
      }
    : null;

  return (
    <Page
      title="Level check"
      lead="Reading, listening, writing and speaking, measured against the dictionary."
      actions={
        <ButtonLink href="/assess?take=1" variant="primary" size="lg">
          <Compass size={16} aria-hidden /> {latest ? "Take it again" : "Take the check"}
        </ButtonLink>
      }
    >
      <Stack>
        {result ? (
          <ResultPanel
            result={result}
            heading={latest ? (
              <>
                Measured{" "}
                <DateText iso={latest.takenAt.toISOString()} zone={clock.zone} options={DATE_AND_TIME} />
              </>
            ) : "Where you are"}
          />
        ) : (
          <Empty
            title="Nothing measured yet"
            body="Reading, listening and writing, climbing until it finds your level. Speaking you judge yourself."
            action={<ButtonLink href="/assess?take=1" variant="primary" size="lg">Start the check</ButtonLink>}
          />
        )}

        <div>
          <SectionTitle hint="hours, not badges">What it means for your goal</SectionTitle>
          <PlanPanel level={result?.overall ?? null} goals={goals} dailyGoal={goals.dailyGoal} />
        </div>

        {history.length > 1 && (
          <div>
            <SectionTitle hint={`${history.length} sittings`}>
              <History size={13} className="mr-1.5 inline" aria-hidden />
              Every check you have taken
            </SectionTitle>
            <Card>
              <ul className="flex flex-col">
                {history.map((row) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-baseline justify-between gap-3 border-t py-3 first:border-t-0"
                    style={{ borderColor: "var(--rule)" }}
                  >
                    <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                      <DateText iso={row.takenAt.toISOString()} zone={clock.zone} options={DATE_AND_TIME} />
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <Chip tone="accent">
                        {row.overall === PRE_A1 ? "below A1" : (row.overall ?? "not measured")}
                      </Chip>
                      <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                        reading {levelLabel(row.reading as Placement["overall"])} · listening{" "}
                        {levelLabel(row.listening as Placement["overall"])} · writing{" "}
                        {levelLabel(row.writing as Placement["overall"])}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
                Every sitting is kept and none is ever edited, so this is a history rather than a
                number that moved. A check taken a fortnight after the last one mostly measures the
                questions, not you: leave it a couple of months.
              </p>
            </Card>
          </div>
        )}

      </Stack>
    </Page>
  );
}
