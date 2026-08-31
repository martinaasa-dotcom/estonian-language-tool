import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, BadgeCheck, CalendarClock, CircleAlert, ClipboardCheck, Clock, Compass, Info, Lightbulb, TriangleAlert } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { goalsFor } from "@/lib/progress/assessment";
import { weeksUntil, targetByBand } from "@/lib/assessment/goals";
import { readinessSignals, recentAttempts } from "@/lib/progress/exam";
import { EVIDENCE_NOTE, assessReadiness } from "@/lib/exam/readiness";
import {
  OFFICIAL_LEVELS, PASS_PCT, bandFor, specFor, writtenMinutes,
} from "@/lib/exam/spec";
import { SKILLS, SKILL_LABEL } from "@/lib/exam/types";
import { formatDateTime } from "@/lib/time/clock";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Meter, Note, Page, Ring, SectionTitle } from "@/components/ui";

export const metadata = { title: "Mock state exam" };

export const dynamic = "force-dynamic";

/**
 * The examination hub.
 *
 * It answers three questions, in the order somebody actually asks them: where
 * am I, which paper could I pass, and what is stopping me. The confidence
 * figure beside each level is the headline, and the evidence tier under it is
 * what stops the headline being a lie: an app that says "72 percent likely to
 * pass B2" after nine reviews has invented a number, and the learner has no way
 * of telling that from a number that means something.
 */
export default async function ExamPage() {
  const ownerId = await requireUserId();
  const [signals, attempts, goals] = await Promise.all([
    readinessSignals(ownerId),
    recentAttempts(ownerId),
    goalsFor(ownerId),
  ]);
  const readiness = assessReadiness(signals);

  /*
    THE GOAL AND THE PAPER WERE TWO FEATURES THAT DID NOT SPEAK TO EACH OTHER.
    Somebody says on their first run that they want B1 by March, and the exam hub
    then lists six levels as though it had never been told. The target is the one
    row of this page they came for, so it goes at the top with the weeks and the
    confidence beside each other, which is the only place those two numbers mean
    anything: eleven weeks and 38 percent is a different life from eleven weeks
    and 71.
  */
  const target = goals.target ? targetByBand(goals.target) : undefined;
  const targetLevel = target
    ? readiness.levels.find((l) => l.level === target.band)
    : undefined;
  const weeks = weeksUntil(goals.deadline, new Date());
  const weakest = targetLevel
    ? [...SKILLS].sort((a, b) => targetLevel.expected[a] - targetLevel.expected[b])[0]
    : undefined;

  // The words live beside the tier in `readiness.ts`, because Today prints the
  // same percentage and two copies of "what this number is worth" is how one
  // screen ends up quietly more confident than the other.
  const evidenceNote = EVIDENCE_NOTE[readiness.evidence];

  return (
    <Page
      eyebrow="Mock examination"
      title="Sit the state exam, before you sit the state exam"
      lead={
        "Estonia examines at A2, B1, B2 and C1. Each paper is four parts, sixty percent to pass, " +
        "and a zero in any one part fails the whole thing. These are imitations of those papers, " +
        "built out of the dictionary, plus two levels the state does not examine at all."
      }
    >
      {target && targetLevel && (
        <section className="mb-10">
          <SectionTitle
            hint={weeks === null ? "no deadline set" : weeks === 0 ? "the deadline is here" : `${weeks} weeks left`}
          >
            The paper you said you were aiming at
          </SectionTitle>
          <Card tone={targetLevel.confidence >= PASS_PCT ? "mint" : "accent"}>
            <div className="flex flex-wrap items-center gap-5">
              <Ring
                pct={targetLevel.confidence}
                size={72}
                tone={targetLevel.confidence >= PASS_PCT ? "var(--mint)" : "var(--accent)"}
                label={`${targetLevel.confidence} percent likely to pass ${target.band}`}
              >
                <span className="tnum text-md font-bold" style={{ color: "var(--ink)" }}>
                  {targetLevel.confidence}%
                </span>
              </Ring>
              <div className="min-w-[16rem] flex-1">
                <p className="text-xl font-bold" style={{ color: "var(--ink)" }}>
                  {target.band}, {target.label.toLowerCase()}
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {weeks === null
                    ? "You set no deadline for it. "
                    : weeks === 0
                      ? "The date you set has arrived. "
                      : `${weeks} ${weeks === 1 ? "week" : "weeks"} until the date you set. `}
                  {targetLevel.confidence >= PASS_PCT
                    ? "We would put you through it today, on the evidence there is."
                    : weakest
                      ? `${SKILL_LABEL[weakest]} is the part standing in the way, predicted at ${targetLevel.expected[weakest]} percent against the sixty a pass needs.`
                      : "There is not enough here yet to say."}
                </p>
                <p className="mt-3 flex flex-wrap items-center gap-3">
                  <ButtonLink href={`/exam/${target.band}`} variant="secondary" size="sm">
                    Sit the {target.band} paper <ArrowRight size={14} aria-hidden />
                  </ButtonLink>
                  <Link
                    href="/settings#goals"
                    className="text-sm underline underline-offset-4"
                    style={{ color: "var(--ink-3)" }}
                  >
                    <CalendarClock size={13} className="mr-1 inline" aria-hidden />
                    Change the goal
                  </Link>
                </p>
              </div>
            </div>
          </Card>
        </section>
      )}

      <section className="mb-10">
        <SectionTitle hint={evidenceNote}>Where you are</SectionTitle>
        <Card tone={readiness.assessed ? "mint" : "accent"}>
          <div className="flex flex-wrap items-center gap-5">
            <Ring
              pct={readiness.assessed ? 100 : 0}
              size={72}
              tone={readiness.assessed ? "var(--mint)" : "var(--accent)"}
              label={readiness.assessed ? `Assessed at ${readiness.assessed}` : "No level assessed yet"}
            >
              <span className="text-xl font-bold" style={{ color: "var(--ink)" }}>
                {readiness.assessed ?? "?"}
              </span>
            </Ring>
            <div className="min-w-[16rem] flex-1">
              <p className="text-xl font-bold" style={{ color: "var(--ink)" }}>
                {readiness.assessed
                  ? `We would bet on you passing ${readiness.assessed} today.`
                  : "We would not bet on any paper yet."}
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {!readiness.next
                  ? "Every paper here is within reach, which is as far as this app can measure."
                  : readiness.assessed
                    ? `The next one up is ${readiness.next}, and the gaps below are what stands between you and it.`
                    : `${readiness.next} is the one to aim at first, and the gaps below are what stands between you and it.`}
              </p>
              {/*
                A page that says "no level assessed yet" and offers no way to be
                assessed is a dead end, and this one was: the figure it leads
                with comes from the level check, and nothing on it said so or
                said where to take one. Ten minutes against the three hours a
                paper costs, so the difference is worth printing.
              */}
              <p className="mt-3 flex flex-wrap items-center gap-3">
                <ButtonLink href="/assess" variant={readiness.assessed ? "secondary" : "primary"} size="sm">
                  <Compass size={14} aria-hidden />
                  {readiness.assessed ? "Check your level again" : "Take the level check"}
                </ButtonLink>
                <span className="text-sm" style={{ color: "var(--ink-3)" }}>
                  About ten minutes, and it is what this figure is built on.
                </span>
              </p>
            </div>
          </div>
        </Card>
      </section>

      <section className="mb-10">
        <SectionTitle hint={`${PASS_PCT} percent to pass, and no part may score nothing`}>
          Every paper, and how likely you are to pass it
        </SectionTitle>
        <ul className="grid gap-4 md:grid-cols-2">
          {readiness.levels.map((level) => {
            const spec = specFor(level.level);
            const official = (OFFICIAL_LEVELS as readonly string[]).includes(level.level);
            const band = bandFor(level.expectedTotal);
            return (
              <Card as="li" key={level.level} hover>
                <div className="flex items-start justify-between gap-3">
                  {/* `min-w-0` so the level's own column can give: without it
                      the three chips below set a floor the card cannot meet at
                      768, where the rail is drawn and the card is at its
                      narrowest, and they were 11px over its border. */}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-2xl font-bold" style={{ color: "var(--ink)" }}>
                        {level.level}
                      </span>
                      {official
                        ? <Chip tone="sky"><BadgeCheck size={12} aria-hidden /> State exam</Chip>
                        : <Chip tone="neutral">Not examined</Chip>}
                      {level.measured && <Chip tone="accent">Sat</Chip>}
                    </div>
                    <p className="mt-2 max-w-[44ch] text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                      {spec.summary}
                    </p>
                  </div>
                  <Ring
                    pct={level.confidence}
                    size={62}
                    tone={level.confidence >= PASS_PCT ? "var(--mint)" : "var(--accent)"}
                    label={`${level.confidence} percent likely to pass ${level.level}`}
                  >
                    <span className="tnum text-md font-bold" style={{ color: "var(--ink)" }}>
                      {level.confidence}%
                    </span>
                  </Ring>
                </div>

                <p className="mt-3 text-sm" style={{ color: "var(--ink-2)" }}>{level.verdict}</p>

                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
                  {SKILLS.map((skill) => (
                    <div key={skill}>
                      <dt className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>
                        {SKILL_LABEL[skill]}
                      </dt>
                      <dd>
                        <Meter
                          pct={level.expected[skill]}
                          label={`${SKILL_LABEL[skill]} predicted at ${level.expected[skill]} percent`}
                          tone={level.expected[skill] >= PASS_PCT ? "var(--mint)" : "var(--peach)"}
                          height={6}
                        />
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                    <Clock size={12} className="mr-1 inline" aria-hidden />
                    {writtenMinutes(spec)} minutes written, then {spec.parts[3]?.minutes ?? 15} speaking
                    {" · "}
                    predicted {level.expectedTotal} percent, {band.label}
                  </span>
                  <ButtonLink href={`/exam/${level.level}`} variant="secondary" size="sm">
                    Sit it <ArrowRight size={14} aria-hidden />
                  </ButtonLink>
                </div>
              </Card>
            );
          })}
        </ul>
      </section>

      <div className="mb-10 grid gap-6 md:grid-cols-2">
        <section>
          <SectionTitle>What you are already good at</SectionTitle>
          {readiness.strengths.length === 0 ? (
            <Note tone="neutral">
              Nothing to report yet. Review for a week or two and this fills in.
            </Note>
          ) : (
            <ul className="grid gap-3">
              {readiness.strengths.map((item) => (
                <Card as="li" key={item.id} tone="mint">
                  <p className="flex items-center gap-2 text-md font-semibold" style={{ color: "var(--mint-ink)" }}>
                    <BadgeCheck size={16} aria-hidden />
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--mint-ink)" }}>
                    {item.detail}
                  </p>
                </Card>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>What is standing in the way</SectionTitle>
          {readiness.gaps.length === 0 ? (
            <Note tone="good">Nothing this app can find. Book the paper.</Note>
          ) : (
            <ul className="grid gap-3">
              {readiness.gaps.map((item) => (
                <Card as="li" key={item.id} tone="peach">
                  <p className="flex items-center gap-2 text-md font-semibold" style={{ color: "var(--peach-ink)" }}>
                    <TriangleAlert size={16} aria-hidden />
                    {item.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--peach-ink)" }}>
                    {item.detail}
                  </p>
                  {item.href && (
                    <Link
                      href={item.href}
                      className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4"
                      style={{ color: "var(--peach-ink)" }}
                    >
                      {item.cta ?? "Go and fix it"} <ArrowRight size={13} aria-hidden />
                    </Link>
                  )}
                </Card>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mb-10">
        <SectionTitle>Papers you have sat</SectionTitle>
        {attempts.length === 0 ? (
          <Note tone="neutral">
            <ClipboardCheck size={14} className="mr-1.5 inline" aria-hidden />
            None yet. A paper you sit is worth more to the estimate above than a month of flashcards,
            because it is the only thing here that measures all four parts at once.
          </Note>
        ) : (
          <ul className="grid gap-2">
            {attempts.map((attempt, index) => (
              <li key={`${attempt.level}-${attempt.at}-${index}`}>
                <Card className="flex flex-wrap items-center justify-between gap-3 !py-3">
                  <span className="flex items-center gap-3">
                    <span className="text-lg font-bold" style={{ color: "var(--ink)" }}>
                      {attempt.level}
                    </span>
                    <Chip tone={attempt.passed ? "good" : "again"}>
                      {attempt.pct} percent, {attempt.passed ? "pass" : "not a pass"}
                    </Chip>
                  </span>
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                    {formatDateTime(new Date(attempt.at))}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card tone="sky">
        <p className="flex items-center gap-2 text-md font-semibold" style={{ color: "var(--sky-ink)" }}>
          <Info size={16} aria-hidden />
          What these papers are, and what they are not
        </p>
        <ul className="mt-2 grid gap-1.5 text-sm leading-relaxed" style={{ color: "var(--sky-ink)" }}>
          <li>
            The frame is real: the parts, the minutes, the points, the sixty percent, and the rule
            that a zero anywhere fails the paper. Sit one and you meet the same clock and the same
            arithmetic.
          </li>
          <li>
            The questions are not the real questions. Every Estonian word in them came out of the
            dictionary, because this app never writes Estonian, so the reading part is built from
            recorded sentences rather than a magazine article and the examiner is a microphone.
          </li>
          <li>
            <CircleAlert size={13} className="mr-1 inline" aria-hidden />
            Nothing scores your pronunciation. There is no verified Estonian speech recogniser
            available here, so you record yourself, listen back and mark yourself against the
            criteria, and the paper says as much on the result.
          </li>
          <li>
            <Lightbulb size={13} className="mr-1 inline" aria-hidden />
            The A1 paper is ours. The state has never set one at that level, so it is built to the
            shape of the A2 paper, one step easier, for a first sitting that is meant to be passable.
          </li>
        </ul>
      </Card>
    </Page>
  );
}
