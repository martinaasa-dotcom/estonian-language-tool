import { Building2, Users } from "lucide-react";
import { BAND_LABEL, QUIET_DAYS, type CohortSummary, type ReadinessBand } from "@/lib/classroom/cohort";
import { EVIDENCE_LABEL, EVIDENCE_NOTE } from "@/lib/exam/readiness";
import { Card, Chip, Empty, Note, SectionTitle, StatTile } from "@/components/ui";

/**
 * A sponsored group, as the sponsor sees it.
 *
 * Three things are missing from this screen on purpose, and each of them is on
 * the teacher's roster one file over. There is no ranking column, because
 * ordering colleagues by how much homework they did is a league table their
 * employer is reading. There is no weakest case, because an employer has no lesson to plan
 * and "Kadri keeps getting the partitive wrong" follows somebody into a review
 * they never see. And there is no confidence percentage, because a figure that
 * precise about a named employee cannot be argued with by the person it
 * describes. None of the three is hidden here: `workplaceRoster` never reads
 * them, and `CohortSummary` has nowhere to put them.
 *
 * What is left is what somebody paying for this can act on: who is practising,
 * and who is on track for the paper the group is aiming at.
 */
export function WorkplaceView({ summary, sponsor }: {
  summary: CohortSummary;
  /** False for a member looking at the group they are in. */
  sponsor: boolean;
}) {
  const { counts } = summary;
  const named = counts.likely + counts.close + counts.far;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile value={summary.members.length} label="People" tone="sky" />
        <StatTile value={summary.active} label={`Practised in ${QUIET_DAYS} days`} tone="mint" />
        <StatTile value={counts.likely} label={`On track for ${summary.level}`} tone="accent" />
      </div>

      {/*
        The list is the sponsor's, and only the sponsor's.

        A class shows students the same leaderboard their classmates see, which
        is what a leaderboard is for. Colleagues are not classmates: an employer
        has a reason to know who is on track, and the person at the next desk
        does not, so what a member sees of the group is the counts above, which
        name nobody. The tiles are safe to share precisely because they are
        aggregate.
      */}
      {sponsor && (
      <section>
        <SectionTitle hint={EVIDENCE_LABEL[summary.evidence]}>Who is where</SectionTitle>

        {summary.members.length <= 1 ? (
          <Empty
            title="Nobody has joined yet"
            body="Share the join code. This fills as people join and start reviewing."
          />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {summary.members.map((member) => {
              const quiet = member.daysSinceLastReview === null || member.daysSinceLastReview > QUIET_DAYS;
              return (
                <li
                  key={member.ownerId}
                  className="flex flex-wrap items-center gap-3 rounded-[var(--r)] border px-4 py-3"
                  style={{
                    borderColor: "var(--rule)",
                    background: "var(--surface)",
                    boxShadow: "var(--shadow-sm)",
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base" style={{ color: "var(--ink)" }}>
                      {member.displayName}
                    </span>
                    <span className="block text-xs" style={{ color: quiet ? "var(--hard-ink)" : "var(--ink-3)" }}>
                      {member.daysSinceLastReview === null
                        ? "no reviews yet"
                        : member.daysSinceLastReview === 0
                          ? "reviewed today"
                          : `last review ${member.daysSinceLastReview} day${member.daysSinceLastReview === 1 ? "" : "s"} ago`}
                      {member.reviewsThisWeek > 0 && ` · ${member.reviewsThisWeek} this week`}
                    </span>
                  </span>
                  <Chip tone={BAND_TONE[member.band]}>{BAND_LABEL[member.band]}</Chip>
                </li>
              );
            })}
          </ul>
        )}

        {/*
          The tier, printed rather than implied. A band is a claim about
          somebody's chances, and this app does not put one on a screen without
          saying what it rests on: `EVIDENCE_NOTE` is the same sentence the
          learner's own examination hub prints about the same history.
        */}
        {named > 0 && (
          <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
            {EVIDENCE_NOTE[summary.evidence]}{" "}
            {counts.unknown > 0 && (
              counts.unknown === 1
                ? "One person has too little history to place yet."
                : `${counts.unknown} people have too little history to place yet.`
            )}
          </p>
        )}
      </section>
      )}

      {sponsor && (
        <Note tone="neutral">
          You see who is practising and roughly where they stand. You do not see anybody&rsquo;s deck,
          their searches, their answers, or which grammar they personally find hard. That line is a
          different query rather than a hidden column, see{" "}
          <code className="text-xs">lib/classroom/roster.ts</code>.
        </Note>
      )}

      {!sponsor && (
        <Card>
          <div className="flex items-start gap-3">
            <Building2 size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent-deep)" }} />
            <div>
              <p className="text-base" style={{ color: "var(--ink-2)" }}>
                Whoever runs this group sees your name, whether you have been practising, and one of
                four bands for {summary.level}. They do not see your deck, your searches, your
                answers, or which grammar you find hard.
              </p>
              <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
                Leaving stops all of it immediately, and takes nothing away from your own deck.
              </p>
            </div>
          </div>
        </Card>
      )}
    </>
  );
}

/**
 * A band's colour, borrowed from the ratings rather than invented.
 *
 * Mint already means recalled and peach already means missed everywhere else in
 * this app, so a band that means "on track" wearing the recalled hue is the
 * palette being read rather than extended (docs/14-design-system.md §1). Each
 * one is a `Chip` tone, which pairs the hue's tint with the hue's own ink: the
 * fill is never what a word is written in.
 */
const BAND_TONE: Record<ReadinessBand, "good" | "hard" | "again" | "neutral"> = {
  likely: "good",
  close: "hard",
  far: "again",
  unknown: "neutral",
};

/** The icon the index page uses for a workplace group, kept next to its view. */
export const WORKPLACE_ICON = Users;
