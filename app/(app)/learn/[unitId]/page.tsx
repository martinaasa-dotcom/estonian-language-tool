import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, GraduationCap, PlayCircle, MessagesSquare, Printer } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { unitById } from "@/lib/collections/syllabus";
import { deckSnapshot } from "@/lib/progress/summary";
import { unitProgress } from "@/lib/collections/syllabus";
import { splitIntoLessons } from "@/lib/collections/lesson";
import { grammarPoint } from "@/lib/estonian/grammar";
import { ButtonLink } from "@/components/Button";
import { icon } from "@/components/icons";
import { sceneTesting } from "@/lib/scenes/catalogue";
import { Card, Chip, Meter, Page, Ring } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { oneEntryPerLemma } from "@/lib/dict/search";
import { readingFor } from "@/lib/progress/readiness";
import { verdictFor } from "@/lib/readiness/narrative";
import { EVIDENCE_LABEL } from "@/lib/exam/readiness";
import { RungChip } from "@/components/readiness/Rung";

export async function generateMetadata({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = unitById(unitId);
  return { title: unit ? unit.title : "Unit" };
}

export const dynamic = "force-dynamic";

/**
 * One unit: what it lets you do, how much of it is learned, and the lesson that
 * teaches it.
 *
 * The can-do statement leads, because it is the only honest unit of progress in
 * a language course. "19 words, 40% learned" is a fact about the app; "you can
 * describe your home and say where things are in it" is a fact about the learner.
 */
export default async function UnitPage({ params }: { params: Promise<{ unitId: string }> }) {
  const { unitId } = await params;
  const unit = unitById(unitId);
  if (!unit) notFound();

  const ownerId = await requireUserId();
  const [snapshot, rows, reading] = await Promise.all([
    deckSnapshot(ownerId),
    prisma.lexeme.findMany({
      where: { lemma: { in: [...unit.lemmas] } },
      select: {
        id: true, lemma: true, translation: true, pos: true, cefr: true, gradationNote: true,
        gradation: true,
        government: true, provenance: true, forms: { select: { formType: true } },
      },
    }),
    // The claim two lines up, answered: could you actually do this yet.
    readingFor(ownerId, unitId),
  ]);

  // One row per lemma, in the unit's own order. A lemma can hold two entries
  // and this page counted both.
  const words = oneEntryPerLemma(rows, unit.lemmas);

  const progress = unitProgress({
    availableLemmas: words.map((l) => l.lemma),
    startedLemmas: [...snapshot.startedLemmas],
    knownLemmas: [...snapshot.knownLemmas],
  });

  /*
    What the unit will build, not what it asked for.

    `cardTypes` is a request and the generator only produces what a word can
    support, so a unit of colours asks for a gradation card and no colour
    gradates. Only that one type is checked here, because the column is already
    selected and the honest check for the others would be fetching every
    example sentence to see whether a gap can be made, which is the query this
    app's own notes warn about.
  */
  const offered = unit.cardTypes.filter((type) =>
    type !== "GRADATION" || words.some((w) => w.gradation && w.gradation !== "NONE"));

  const Icon = icon(unit.icon);
  const tested = sceneTesting(unit.id);
  const missing = unit.lemmas.length - words.length;
  const lessons = splitIntoLessons(words).length;

  return (
    <Page
      title={unit.title}
      lead={unit.blurb}
      actions={
        <Link href="/learn" className="flex items-center gap-1.5 text-sm" style={{ color: "var(--accent-deep)" }}>
          <ArrowLeft size={14} aria-hidden /> Back to the path
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        <Card className="flex flex-wrap items-center gap-5">
          <Ring pct={progress.pct} size={70} label={`${progress.pct}% of this unit learned`}>
            <Icon size={22} aria-hidden style={{ color: "var(--accent-deep)" }} />
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base" style={{ color: "var(--ink)" }}>{unit.subtitle}</span>
              <Chip tone="accent">{unit.cefr}</Chip>
              {progress.state === "done" && <Chip tone="good">Finished</Chip>}
            </div>
            <p className="mt-1.5 text-md" style={{ color: "var(--ink)" }}>{unit.canDo}</p>
            {reading && reading.rung !== "unmet" && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
                <RungChip rung={reading.rung} />
                <span>{verdictFor(reading)} {EVIDENCE_LABEL[reading.evidence].charAt(0).toUpperCase()}{EVIDENCE_LABEL[reading.evidence].slice(1)}.</span>
                <Link href={`/progress/readiness/${unit.id}`} className="underline" style={{ color: "var(--accent-deep)" }}>
                  Where it would go wrong
                </Link>
              </p>
            )}
            <p className="mt-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
              {progress.known} of {progress.available} words known · {progress.started} started
              {lessons > 1 && ` · ${lessons} lessons`}
            </p>
            <div className="mt-2 max-w-sm">
              <Meter
                pct={progress.pct}
                label={`${unit.title}: ${progress.pct}% learned`}
                tone={progress.state === "done" ? "var(--good)" : "var(--accent)"}
              />
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-52">
            {/*
              One way in, and it is the lesson.

              There were two doors here and they did different things: "start
              the lesson", which teaches a word with a sentence before asking
              anything about it, and "add 19 words", which wrote the cards
              straight into the deck. The second one made the first optional,
              and `lib/collections/lesson.ts` opens by stating the rule the
              second one broke: nothing is asked before it is taught. Every
              learner who took the quicker-looking door met their first sight of
              a word as a flashcard testing them on it.

              The lesson already adds its own words as it finishes
              (`completeLesson`), so nothing is lost by taking the shortcut
              away, and a unit that is half done says "continue" rather than
              starting again. Words that arrive by another door entirely, first
              run's starter units, the scanner, the dictionary, a paste import,
              are taught by the first-meeting screen in review instead.
            */}
            {progress.available > 0 && (
              <ButtonLink href={`/learn/${unit.id}/lesson`} variant="primary" className="justify-center">
                <PlayCircle size={15} aria-hidden />
                {progress.started > 0 ? "Continue the lesson" : "Start the lesson"}
              </ButtonLink>
            )}
            {progress.started > 0 && (
              <ButtonLink href={`/review?unit=${unit.id}`} variant="ghost" className="justify-center">
                <GraduationCap size={15} aria-hidden /> Drill this unit
              </ButtonLink>
            )}
            {/* For the half of a class that happens on paper. */}
            <ButtonLink href={`/learn/${unit.id}/worksheet`} variant="ghost" size="sm" className="justify-center">
              <Printer size={14} aria-hidden /> Printable worksheet
            </ButtonLink>
            {/*
              And the scene that checks this unit's promise, where one exists.
              A unit says the learner will be able to do something; a
              situation is where that claim is tested against somebody with an
              agenda of their own. The two-way link is what makes Situations
              part of the course rather than a game beside it.
            */}
            {tested && (
              <ButtonLink href={`/situations/${tested.id}`} variant="ghost" size="sm" className="justify-center">
                <MessagesSquare size={14} aria-hidden /> Try it on somebody
              </ButtonLink>
            )}
          </div>
        </Card>

        {unit.grammar.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="label-xs" style={{ color: "var(--ink-3)" }}>Grammar</span>
            {unit.grammar.map((id) => {
              const point = grammarPoint(id);
              if (!point) return null;
              return (
                <Link
                  key={id}
                  href={point.href}
                  className="flex flex-wrap items-baseline gap-1.5 rounded-[var(--r-sm)] px-2.5 py-1 text-sm"
                  style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                >
                  <span lang={point.estonian ? "et" : undefined} className="underline">
                    {point.title}
                  </span>
                  <span className="text-xs" style={{ opacity: 0.75 }}>{point.english}</span>
                </Link>
              );
            })}
          </div>
        )}

        <div>
          <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            {words.length} words · {offered.map(cardTypeLabel).join(", ")} cards
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {words.map((l) => {
              const known = snapshot.knownLemmas.has(l.lemma);
              const started = snapshot.startedLemmas.has(l.lemma);
              return (
                <li
                  key={l.id}
                  className="flex items-center gap-3 rounded-[var(--r-lg)] border px-4 py-2.5"
                  style={{
                    borderColor: "var(--rule)",
                    background: known ? "var(--good-soft)" : "var(--surface)",
                  }}
                >
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/dictionary?q=${encodeURIComponent(l.lemma)}`}
                      lang="et"
                      className="text-md font-semibold hover:underline"
                      style={{ color: "var(--ink)" }}
                    >
                      {l.lemma}
                    </Link>
                    <span className="block truncate text-xs" style={{ color: "var(--ink-2)" }}>
                      {l.translation}
                    </span>
                    {l.government && (
                      <span className="block text-2xs" style={{ color: "var(--accent-deep)" }}>{l.government}</span>
                    )}
                  </span>
                  {l.gradationNote && <Chip tone="hard" caseSensitive>{l.gradationNote}</Chip>}
                  <Speak text={l.lemma} />
                  {known ? (
                    <Check size={16} aria-label="Known" style={{ color: "var(--good-ink)" }} />
                  ) : started ? (
                    <span className="label-xs" style={{ color: "var(--ink-3)" }}>Learning</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {missing > 0 && (
            <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
              {missing} word{missing === 1 ? "" : "s"} in this unit {missing === 1 ? "is" : "are"} not in
              your dictionary yet. Search {missing === 1 ? "it" : "them"} once and
              {missing === 1 ? " it's" : " they're"} saved for good.
            </p>
          )}
        </div>
      </div>
    </Page>
  );
}

function cardTypeLabel(type: string): string {
  return type.toLowerCase().replace("_", " ");
}
