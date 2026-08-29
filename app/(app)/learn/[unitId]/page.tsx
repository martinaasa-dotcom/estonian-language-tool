import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, GraduationCap, PlayCircle, Printer } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { unitById } from "@/lib/collections/syllabus";
import { deckSnapshot } from "@/lib/progress/summary";
import { unitProgress } from "@/lib/collections/syllabus";
import { splitIntoLessons } from "@/lib/collections/lesson";
import { AddUnitButton } from "@/components/AddUnitButton";
import { ButtonLink } from "@/components/Button";
import { icon } from "@/components/icons";
import { Card, Chip, Meter, Page, Ring } from "@/components/ui";
import { Speak } from "@/components/Speak";

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
  const [snapshot, lexemes] = await Promise.all([
    deckSnapshot(ownerId),
    prisma.lexeme.findMany({
      where: { lemma: { in: [...unit.lemmas] } },
      select: { id: true, lemma: true, translation: true, pos: true, cefr: true, gradationNote: true, government: true },
    }),
  ]);

  const order = new Map(unit.lemmas.map((l, i) => [l, i]));
  lexemes.sort((a, b) => (order.get(a.lemma) ?? 0) - (order.get(b.lemma) ?? 0));

  const progress = unitProgress({
    availableLemmas: lexemes.map((l) => l.lemma),
    startedLemmas: [...snapshot.startedLemmas],
    knownLemmas: [...snapshot.knownLemmas],
  });

  const Icon = icon(unit.icon);
  const missing = unit.lemmas.length - lexemes.length;
  const lessons = splitIntoLessons(lexemes).length;

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
              The lesson leads, and adding the words raw is the secondary action
              now. Before this, a unit's only two doors were "put 19 words into
              your deck" and "drill them", so meeting a word for the first time
              and being tested on it were the same screen.
            */}
            {progress.available > 0 && (
              <ButtonLink href={`/learn/${unit.id}/lesson`} className="justify-center">
                <PlayCircle size={15} aria-hidden />
                {progress.started > 0 ? "Continue the lesson" : "Start the lesson"}
              </ButtonLink>
            )}
            {progress.started > 0 && (
              <ButtonLink href={`/review?unit=${unit.id}`} variant="ghost" className="justify-center">
                <GraduationCap size={15} aria-hidden /> Drill this unit
              </ButtonLink>
            )}
            <AddUnitButton unitId={unit.id} words={progress.available} started={progress.started > 0} />
            {/* For the half of a class that happens on paper. */}
            <ButtonLink href={`/learn/${unit.id}/worksheet`} variant="ghost" size="sm" className="justify-center">
              <Printer size={14} aria-hidden /> Printable worksheet
            </ButtonLink>
          </div>
        </Card>

        <div>
          <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            {lexemes.length} words · {unit.cardTypes.map(cardTypeLabel).join(", ")} cards
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {lexemes.map((l) => {
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
                      className="est text-md font-semibold hover:underline"
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
              your dictionary yet. Search {missing === 1 ? "it" : "them"} once and, with an Ekilex key,
              {missing === 1 ? " it is" : " they are"} fetched and stored for good.
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
