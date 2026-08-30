import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight, BadgeCheck, FileWarning, Info, Repeat, TrendingDown, TrendingUp, Trophy,
  TriangleAlert,
} from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { attemptById, bestAt, previousAttempt } from "@/lib/progress/exam";
import { buildReport } from "@/lib/exam/report";
import { allMarks } from "@/lib/exam/score";
import { PASS_PCT, specFor } from "@/lib/exam/spec";
import { SKILL_ET } from "@/lib/exam/types";
import { NO_VALUE } from "@/lib/copy/values";
import { formatDateTime } from "@/lib/time/clock";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Meter, Note, Page, Ring, SectionTitle } from "@/components/ui";
import { SuggestFix } from "@/components/SuggestFix";
import { AnuReading } from "./AnuReading";

export const metadata = { title: "Exam result" };

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
  /*
    Not off `report.missed`: a text that scored well is not in that list, and it
    is the answer worth reading back whether or not it lost marks. Both of them
    now, because the writing part sets two, and the short message is the one
    people get wrong by treating it as a small essay.
  */
  const written = allMarks(result).filter((mark) => typeof mark.raw === "string" && mark.raw);

  /*
    Both strictly earlier than this sitting, so opening an old result compares it
    with the papers before it rather than with ones sat afterwards, and so "your
    best yet" means it beat everything, rather than being trivially true of the
    row it was computed from.
  */
  const [previous, best] = await Promise.all([
    previousAttempt(ownerId, result.level, attempt.finishedAt),
    bestAt(ownerId, result.level, attempt.finishedAt),
  ]);
  const moved = previous ? result.pct - previous.pct : null;

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

      {(previous || best === null || result.pct > best) && (
        <section className="mb-10">
          <SectionTitle>Against your own record</SectionTitle>
          <ul className="grid gap-3 md:grid-cols-2">
            {previous && moved !== null && (
              <Card as="li" tone={moved >= 0 ? "mint" : "peach"}>
                <p
                  className="flex items-center gap-2 text-md font-semibold"
                  style={{ color: moved >= 0 ? "var(--mint-ink)" : "var(--peach-ink)" }}
                >
                  {moved >= 0 ? <TrendingUp size={16} aria-hidden /> : <TrendingDown size={16} aria-hidden />}
                  {moved === 0
                    ? `Level with your last ${result.level}`
                    : `${moved > 0 ? "Up" : "Down"} ${Math.abs(moved)} points on your last ${result.level}`}
                </p>
                <p
                  className="mt-1 text-sm leading-relaxed"
                  style={{ color: moved >= 0 ? "var(--mint-ink)" : "var(--peach-ink)" }}
                >
                  {previous.pct} percent on {formatDateTime(previous.at)}, {result.pct} today. The
                  questions were not the same ones, so this is two samples of the same paper rather
                  than a rerun of one.
                </p>
              </Card>
            )}
            {(best === null || result.pct > best) && (
              <Card as="li" tone="accent">
                <p className="flex items-center gap-2 text-md font-semibold" style={{ color: "var(--ink)" }}>
                  <Trophy size={16} aria-hidden />
                  Your best {result.level} yet
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {best === null
                    ? "Your first paper at this level, so it is the one to beat."
                    : `Better than anything you had sat at this level, which stood at ${best} percent.`}
                </p>
              </Card>
            )}
          </ul>
        </section>
      )}

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

      {written.length > 0 && (
        <section className="mb-10">
          <SectionTitle hint={written.length > 1 ? "both of them" : undefined}>
            What you wrote
          </SectionTitle>
          {/*
            THE ONE PLACE THIS SCORE CAN FLATTER SOMEBODY, SAID OUT LOUD. The
            marks on these two came from length and from the words the task
            named, because those are the only things a machine can settle
            without judging Estonian. An examiner marks the accuracy of the
            prose itself and this app never will, so the mark is a ceiling
            rather than a measurement, and somebody reading a good writing score
            has to know which of the two they are holding.
          */}
          <div className="mb-4">
            <Note tone="neutral">
              <Info size={14} className="mr-1.5 inline" aria-hidden />
              These marks are for length and for using the words you were given. Whether the
              Estonian itself is right is what an examiner marks and what nothing here may judge, so
              treat this part of your score as the most you could have got rather than what you
              would have got. Anu will read either text back and say what she thinks, and her note
              carries no marks.
            </Note>
          </div>
          <ul className="grid gap-4">
            {written.map((mark) => {
              const task = result.parts
                .flatMap((p) => p.tasks)
                .find((t) => t.marks.some((m) => m.itemId === mark.itemId));
              return (
                <li key={mark.itemId}>
                  <AnuReading
                    text={mark.raw ?? ""}
                    level={result.level}
                    title={task?.title}
                    marks={`${Math.round(mark.scored * 10) / 10} of ${mark.available}`}
                  />
                </li>
              );
            })}
          </ul>
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
        {report.missed.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/*
              Every mark on this paper is a comparison against a form the
              dictionary vouches for, which is what keeps a model out of the
              judgement. It does not make the dictionary right, and a candidate
              who has just been marked down by it is the person most likely to
              have spotted that.
            */}
            <p className="text-sm" style={{ color: "var(--ink-3)" }}>
              Marked wrong and you think it was right?
            </p>
            <SuggestFix
              category="MARKED_WRONG"
              categories={["MARKED_WRONG", "WRONG_CONTENT"]}
              trigger={`A ${result.level} mock paper marked ${report.missed.length} answer(s) wrong.`}
              label="Tell us about the marking"
            />
          </div>
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
