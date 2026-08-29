import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight, BadgeCheck, FileWarning, Repeat, TriangleAlert,
} from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { attemptById } from "@/lib/progress/exam";
import { buildReport } from "@/lib/exam/report";
import { allMarks } from "@/lib/exam/score";
import { PASS_PCT, specFor } from "@/lib/exam/spec";
import { SKILL_ET } from "@/lib/exam/types";
import { NO_VALUE } from "@/lib/copy/values";
import { formatDateTime } from "@/lib/time/clock";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Meter, Note, Page, Ring, SectionTitle } from "@/components/ui";
import { AnuReading } from "./AnuReading";

export const dynamic = "force-dynamic";

/**
 * The result, and the half of it that is worth having.
 *
 * A real slip gives four percentages and nothing else, which leaves a candidate
 * who failed on 57 percent guessing which part to work on. This says where every
 * mark went, names the task that did the damage, and lists every question that
 * was wrong with the answer beside it, because a mock exam whose answers you
 * never see is a test rather than a lesson.
 */
export default async function ExamResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ownerId = await requireUserId();
  const attempt = await attemptById(ownerId, id);
  if (!attempt) notFound();

  const result = attempt.parsed;
  if (!result) {
    return (
      <Page title="That result cannot be read" eyebrow="Mock examination">
        <Note tone="again">
          The stored paper is in a shape this version of the app does not understand. The score is
          still {attempt.pct} percent, which counted as {attempt.passed ? "a pass" : "a fail"}.
        </Note>
      </Page>
    );
  }

  const report = buildReport(result);
  const spec = specFor(result.level);
  // Not off `report.missed`: a composition that scored well is not in that list, and it
  // is the one answer worth reading back whether or not it lost marks.
  const composition = allMarks(result).find((mark) => typeof mark.raw === "string" && mark.raw);

  return (
    <Page
      eyebrow={`${result.level} · sat ${formatDateTime(attempt.finishedAt)}`}
      title={result.passed ? "Passed" : "Not this time"}
      lead={report.headline}
      actions={
        <ButtonLink href={`/exam/${result.level}`} variant="secondary">
          <Repeat size={15} aria-hidden /> Another paper
        </ButtonLink>
      }
    >
      <section className="mb-10">
        <Card tone={result.passed ? "mint" : "peach"}>
          <div className="flex flex-wrap items-center gap-6">
            <Ring
              pct={result.pct}
              size={92}
              thickness={8}
              tone={result.passed ? "var(--mint)" : "var(--peach)"}
              label={`${result.pct} percent`}
            >
              <span className="est tnum text-2xl font-bold" style={{ color: "var(--ink)" }}>
                {result.pct}%
              </span>
            </Ring>
            <div className="min-w-[16rem] flex-1">
              <p className="est text-xl font-bold" style={{ color: "var(--ink)" }}>
                {result.points} of {result.maxPoints} points, {result.band.label}
              </p>
              <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {report.consequence}
              </p>
              {result.absentParts.length > 0 && (
                <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
                  <FileWarning size={14} aria-hidden />
                  {result.absentParts.map((skill) => SKILL_ET[skill]).join(" and ")} could not be
                  set at all, so {result.absentParts.length === 1 ? "it is" : "they are"} left out
                  of the total rather than scored as nothing.
                </p>
              )}
              {result.thin && (
                <p className="mt-2 flex items-center gap-1.5 text-sm" style={{ color: "var(--ink-3)" }}>
                  <FileWarning size={14} aria-hidden />
                  The dictionary could not fill every task, so this is a percentage of a shorter
                  paper than the specification sets.
                </p>
              )}
            </div>
          </div>
        </Card>
      </section>

      <section className="mb-10">
        <SectionTitle hint={`${PASS_PCT} percent to pass`}>The four parts</SectionTitle>
        <ul className="grid gap-3 md:grid-cols-2">
          {result.parts.map((part) => (
            <Card as="li" key={part.skill}>
              <div className="flex items-baseline justify-between gap-3">
                <span>
                  <span className="est text-md font-semibold" style={{ color: "var(--ink)" }}>
                    {part.label}
                  </span>
                  <span className="ml-2 text-sm" style={{ color: "var(--ink-3)" }}>
                    {SKILL_ET[part.skill]}
                  </span>
                </span>
                <span className="est tnum text-lg font-bold" style={{ color: "var(--ink)" }}>
                  {part.rawAvailable === 0 ? NO_VALUE : part.points}
                  {part.rawAvailable > 0 && (
                    <span className="text-sm font-normal" style={{ color: "var(--ink-3)" }}>
                      {" "}of {part.maxPoints}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-2">
                <Meter
                  pct={part.pct}
                  label={`${part.label} at ${part.pct} percent`}
                  tone={part.pct >= PASS_PCT ? "var(--mint)" : "var(--peach)"}
                />
              </div>
              <ul className="mt-3 grid gap-1">
                {part.tasks.map((task) => (
                  <li key={task.taskId} className="flex items-baseline justify-between gap-3 text-sm">
                    <span style={{ color: "var(--ink-2)" }}>{task.title}</span>
                    <span className="tnum shrink-0" style={{ color: "var(--ink-3)" }}>
                      {task.rawAvailable === 0
                        ? NO_VALUE
                        : `${Math.round(task.raw * 10) / 10} of ${task.rawAvailable}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </ul>
      </section>

      <div className="mb-10 grid gap-6 md:grid-cols-2">
        <section>
          <SectionTitle>What went well</SectionTitle>
          {report.strengths.length === 0 ? (
            <Note tone="neutral">Nothing cleared three quarters this time. That is what the list opposite is for.</Note>
          ) : (
            <ul className="grid gap-3">
              {report.strengths.map((item) => (
                <Card as="li" key={item.id} tone="mint">
                  <p className="flex items-center gap-2 text-md font-semibold" style={{ color: "var(--mint-ink)" }}>
                    <BadgeCheck size={16} aria-hidden /> {item.title}
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
          <SectionTitle>Where the marks went</SectionTitle>
          {report.gaps.length === 0 ? (
            <Note tone="good">Every part cleared three quarters. There is nothing here to fix.</Note>
          ) : (
            <ul className="grid gap-3">
              {report.gaps.map((item) => (
                <Card as="li" key={item.id} tone="peach">
                  <p className="flex items-center gap-2 text-md font-semibold" style={{ color: "var(--peach-ink)" }}>
                    <TriangleAlert size={16} aria-hidden /> {item.title}
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
                      {item.cta ?? "Practise it"} <ArrowRight size={13} aria-hidden />
                    </Link>
                  )}
                </Card>
              ))}
            </ul>
          )}
        </section>
      </div>

      {report.repeatOffenders.length > 0 && (
        <section className="mb-10">
          <SectionTitle hint="wrong more than once across the paper">Words that kept catching you</SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {report.repeatOffenders.map((word) => (
              <li key={word.lexemeId}>
                <Link href={`/dictionary?q=${encodeURIComponent(word.lemma)}`}>
                  <Chip tone="again" caseSensitive>
                    <span className="est" lang="et">{word.lemma}</span>
                    <span>{word.times} times</span>
                  </Chip>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {composition?.raw && (
        <section className="mb-10">
          <SectionTitle>Your text</SectionTitle>
          <AnuReading text={composition.raw} level={result.level} />
        </section>
      )}

      <section>
        <SectionTitle hint={`${report.missed.length} of them`}>Everything you got wrong</SectionTitle>
        {report.missed.length === 0 ? (
          <Note tone="good">Nothing. Every question on the paper.</Note>
        ) : (
          <ul className="grid gap-2">
            {report.missed.map((mark) => {
              // Three question shapes answer in English. Tagging those Estonian
              // set them in the Estonian face and had a screen reader pronounce
              // "cheese" as an Estonian word.
              const et = mark.language !== "en";
              return (
              <Card as="li" key={mark.itemId} className="!py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span
                    className={`text-md ${et ? "est" : ""}`}
                    style={{ color: "var(--mint-ink)" }}
                    lang={et ? "et" : undefined}
                  >
                    {mark.expected}
                  </span>
                  <span className="text-sm" style={{ color: "var(--ink-3)" }}>
                    you wrote{" "}
                    <span
                      className={et ? "est" : ""}
                      lang={et ? "et" : undefined}
                      style={{ color: "var(--peach-ink)" }}
                    >
                      {mark.given || NO_VALUE}
                    </span>
                  </span>
                </div>
                {mark.note && (
                  <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>{mark.note}</p>
                )}
              </Card>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-8 text-sm" style={{ color: "var(--ink-3)" }}>
        {spec.official
          ? "The frame of this paper is the real one. The questions are not."
          : "The state does not examine at this level, so nothing about this paper is official."}
        {" "}
        <Link href="/exam" className="underline underline-offset-4">Back to the exam hub</Link>
      </p>
    </Page>
  );
}
