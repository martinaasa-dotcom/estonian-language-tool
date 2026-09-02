import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Check, Compass, Lock } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { deckSnapshot, pathWithProgress } from "@/lib/progress/summary";
import { unitById } from "@/lib/collections/syllabus";
import { courseLevelFor } from "@/lib/progress/level";
import {
  CHECKPOINTS, LEVELS, LEVEL_INFO, isUnitOpen, nextUnit,
} from "@/lib/collections/syllabus";
import { ButtonLink } from "@/components/Button";
import { icon } from "@/components/icons";
import { Chip, Meter, Page, Ring, SectionTitle } from "@/components/ui";
import { learnCounts } from "@/lib/progress/learn";
import { LEARN_BATCH } from "@/lib/learn/ladder";
import { Sparkles } from "lucide-react";

export const metadata = { title: "Learn" };

export const dynamic = "force-dynamic";

/**
 * The course.
 *
 * Eighty-two units is far too many for one list, so the page is the five CEFR
 * levels and each one opens. The learner's own level is open on arrival and the
 * rest are shut. That is also the honest shape of the thing, because a level is
 * the unit of progress a learner actually cares about. "Four units into B1"
 * means something; "unit 31 of 82" does not.
 *
 * Progress is computed from the deck (lib/progress/summary.ts), so a unit fills
 * up as its words are genuinely learned rather than as they are clicked on.
 */
export default async function LearnPage() {
  const ownerId = await requireUserId();
  const [snapshot, placement, counts] = await Promise.all([
    deckSnapshot(ownerId),
    courseLevelFor(ownerId),
    learnCounts(ownerId),
  ]);
  const units = await pathWithProgress(ownerId, snapshot);

  const doneIds = new Set(units.filter((u) => u.state === "done").map((u) => u.unit.id));
  const startedIds = new Set(units.filter((u) => u.state === "learning").map((u) => u.unit.id));
  const next = nextUnit({ doneUnitIds: doneIds, startedUnitIds: startedIds, placement });

  // Counted over distinct lemmas rather than summed across units. A grammar unit
  // deliberately drills vocabulary an earlier unit introduced — the object unit
  // teaches its rule with verbs from A1 — so adding up per-unit totals counted
  // those words twice and told the learner the course was about seventy words
  // bigger than it is.
  const countWords = (rows: typeof units) => {
    const lemmas = new Set(rows.flatMap((u) => u.lemmas));
    return {
      words: lemmas.size,
      known: [...lemmas].filter((l) => snapshot.knownLemmas.has(l)).length,
    };
  };

  const { words: totalWords, known: knownWords } = countWords(units);
  const overall = totalWords > 0 ? Math.round((knownWords / totalWords) * 100) : 0;

  const byLevel = LEVELS.map((level) => {
    const rows = units.filter((u) => u.unit.level === level);
    const { words, known } = countWords(rows);
    return {
      level,
      rows,
      words,
      known,
      pct: words > 0 ? Math.round((known / words) * 100) : 0,
      finished: rows.length > 0 && rows.every((u) => u.state === "done"),
    };
  });

  return (
    <Page
      title="Learn"
      lead="New words, one small round at a time, and the course they come out of."
    >
      {/*
        WHAT THIS PAGE LEADS WITH IS THE NEXT FIVE WORDS, NOT THE MAP.

        The course is eighty-two units and answers "where am I going". It is
        the wrong first thing on a screen somebody opened to study, because
        choosing a unit is a decision and the honest answer to it at any given
        level is "the next one". So the ladder is the card at the top and the
        map is under it: a learner who wants to pick reads on, and one who
        wants to learn presses the button.
      */}
      <LearnCard waiting={counts.waiting} started={counts.started} />

      <SectionTitle hint={`A1 to C1 · working at ${placement}`}>The course</SectionTitle>
      {/*
        Stacked on a phone, one row above it. `flex-wrap` alone looked right and
        was not: at 390px the ring and the button both stayed on the row and
        squeezed the text between them into a column four words wide. Wrapping
        only helps when a child is allowed to take a whole line, so the phone
        layout is a column and the row starts at the small breakpoint.
      */}
      <div
        className="mb-7 flex flex-col gap-4 rounded-[var(--r-lg)] border p-5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <Ring pct={overall} size={72} label={`${overall}% of the course learned`}>
          <span className="tnum text-sm font-bold" style={{ color: "var(--ink)" }}>{overall}%</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="text-base" style={{ color: "var(--ink)" }}>
            You are working at {placement} · {knownWords} of {totalWords} words known
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>
            A word counts as known once every card made from it has moved past the learning stage,
            not just been answered right once.
          </p>
          <Link
            href="/assess"
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs underline"
            style={{ color: "var(--accent-deep)" }}
          >
            <Compass size={13} aria-hidden /> Not sure? Take the level check
          </Link>
        </div>
        {next && (
          <ButtonLink
            href={`/learn/${next.id}/lesson`}
            variant="primary"
            className="w-full justify-center sm:w-auto"
          >
            {startedIds.has(next.id) ? "Continue" : "Start"}: {next.title}
          </ButtonLink>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {byLevel.map(({ level, rows, words, known, pct, finished }) => {
          const info = LEVEL_INFO[level];
          const checkpoint = CHECKPOINTS.find((c) => c.level === level);
          // The learner's own level is open on arrival; so is anything they have
          // already started, so work in progress is never hidden behind a click.
          const open = level === placement || rows.some((u) => u.state === "learning");
          return (
            <details
              key={level}
              open={open}
              className="rounded-[var(--r-lg)] border"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
            >
              <summary className="flex min-h-[56px] cursor-pointer flex-wrap items-center gap-3 p-4 sm:gap-4">
                <span
                  className="tnum flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{
                    // Two contrast fixes live here, and both came from putting
                    // *text* on backgrounds the app had only ever used behind an
                    // icon. White on --accent is 4.05:1 and white on --mint is
                    // 2.30:1, neither of which clears AA for a 13.5px label;
                    // --accent-deep is 6.25:1 and flips correctly in dark mode.
                    // --ink-3 on --raised is 4.05:1 too, so the resting badge
                    // takes --ink-2: the muted token is for a hint beside
                    // something, not for the only thing in a badge.
                    background: finished ? "var(--mint)" : pct > 0 ? "var(--accent-deep)" : "var(--raised)",
                    color: finished || pct > 0 ? "var(--surface)" : "var(--ink-2)",
                  }}
                >
                  {finished ? <Check size={20} aria-hidden /> : level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span lang="et" className="text-lg font-bold" style={{ color: "var(--ink)" }}>
                      {info.title}
                    </span>
                    {level === placement && <Chip tone="accent">You are here</Chip>}
                  </span>
                  <span className="mt-0.5 block max-w-[70ch] text-sm" style={{ color: "var(--ink-2)" }}>
                    {info.summary}
                  </span>
                  <span className="mt-2 flex items-center gap-3">
                    <span className="max-w-[220px] flex-1">
                      <Meter
                        pct={pct}
                        label={`${level}: ${known} of ${words} words known`}
                        tone={finished ? "var(--good)" : "var(--accent)"}
                        height={7}
                      />
                    </span>
                    <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>
                      {rows.length} units · {known}/{words} words
                    </span>
                  </span>
                </span>
              </summary>

              <ol className="flex flex-col gap-2 border-t p-4" style={{ borderColor: "var(--rule)" }}>
                {rows.map((u) => {
                  const Icon = icon(u.unit.icon);
                  const locked = !isUnitOpen({ unit: u.unit, doneUnitIds: doneIds, placement });
                  const complete = u.state === "done";
                  return (
                    <li
                      key={u.unit.id}
                      className="flex flex-wrap items-center gap-4 rounded-[var(--r-sm)] border p-3"
                      /*
                        A locked unit is quieter, and the quiet used to be an
                        `opacity: 0.6` on the whole row. That fades the words:
                        the unit's own name came out at 4.25, its can-do
                        statement at 2.8 and, worst of all, the line saying
                        "Builds on X. You can still open it." at 2.63 against a
                        bar of 4.5. The app was telling somebody this unit is
                        available to them in the least readable text on the
                        page, on every locked row of a 73-unit course.

                        The row already says "not yet" four other ways: a
                        padlock, a plain border, that sentence, and a button
                        reading Learn rather than Continue. The fade moves onto
                        the padlock, which carries no words.
                      */
                      style={{
                        borderColor: complete ? "var(--mint)" : u.state === "learning" ? "var(--accent)" : "var(--rule)",
                        background: "var(--surface)",
                      }}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: complete ? "var(--mint)" : u.state === "learning" ? "var(--accent)" : "var(--raised)",
                          color: complete || u.state === "learning" ? "var(--surface)" : "var(--ink-3)",
                          opacity: locked ? 0.6 : 1,
                        }}
                      >
                        {locked ? <Lock size={16} aria-hidden /> : complete ? <Check size={18} aria-hidden /> : <Icon size={17} aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <Link
                          href={`/learn/${u.unit.id}`}
                          lang="et"
                          className="text-md font-bold hover:underline"
                          style={{ color: "var(--ink)" }}
                        >
                          {u.unit.title}
                        </Link>
                        <span className="block max-w-[62ch] text-sm" style={{ color: "var(--ink-2)" }}>
                          {u.unit.canDo}
                        </span>
                        {locked && (
                          <span className="mt-1 block text-xs" style={{ color: "var(--ink-3)" }}>
                            Builds on {u.unit.requires.map((id) => unitById(id)?.title ?? id).join(", ")}. You can still open it.
                          </span>
                        )}
                      </span>
                      <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>
                        {u.known}/{u.available}
                      </span>
                      <ButtonLink
                        href={u.available > 0 ? `/learn/${u.unit.id}/lesson` : `/learn/${u.unit.id}`}
                        variant={u.state === "learning" ? "primary" : "ghost"}
                        size="sm"
                        className="w-full justify-center sm:w-32"
                      >
                        {complete ? "Revisit" : u.state === "learning" ? "Continue" : "Learn"}
                      </ButtonLink>
                    </li>
                  );
                })}

                {checkpoint && (
                  <li
                    className="flex flex-wrap items-center gap-4 rounded-[var(--r-sm)] border border-dashed p-3"
                    style={{ borderColor: "var(--rule)" }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="text-md font-bold" style={{ color: "var(--ink)" }}>
                        {checkpoint.title}
                      </span>
                      <span className="block max-w-[62ch] text-sm" style={{ color: "var(--ink-2)" }}>
                        {checkpoint.blurb} {checkpoint.questions} questions, {checkpoint.passMark}% to pass.
                      </span>
                    </span>
                    <ButtonLink
                      href={`/learn/checkpoint/${level.toLowerCase()}`}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-center sm:w-32"
                    >
                      Take it
                    </ButtonLink>
                  </li>
                )}
              </ol>
            </details>
          );
        })}
      </div>

      <p className="mt-6 text-xs" style={{ color: "var(--ink-3)" }}>
        Units are shortcuts into the same dictionary, not a separate course. Everything in them can
        also be found by searching, and anything missing you can{" "}
        <Link href="/dictionary" className="underline" style={{ color: "var(--accent-deep)" }}>add yourself</Link>.
        Nothing is ever truly locked: a unit above your level shows what it builds on, and opens anyway.
      </p>
    </Page>
  );
}

/**
 * The next round of new words, and what happens to them.
 *
 * Three states rather than one with a disabled button. Words waiting is the
 * ordinary case; words part way up the ladder and none waiting is somebody who
 * has taken everything their deck holds and is finishing it off; nothing at all
 * is a deck that needs filling, and the course underneath is the way to fill it,
 * which is why this says so rather than offering a dead button.
 */
function LearnCard({ waiting, started }: { waiting: number; started: number }) {
  const ready = waiting + started;
  return (
    <div
      className="mb-7 flex flex-col gap-4 rounded-[var(--r-lg)] border p-5 sm:flex-row sm:items-center"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
      >
        <Sparkles size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold" style={{ color: "var(--ink)" }}>
          {ready > 0 ? "New words" : "No new words waiting"}
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
          {ready > 0
            ? "Meet it, then pick what it means, then put it back in the sentence. Words you can produce move over to practice."
            : "Open a unit below and its words arrive here, ready to be met."}
        </p>
        {ready > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--ink-3)" }}>
            <Chip tone="accent">{waiting} never seen</Chip>
            {started > 0 && <Chip tone="hard">{started} part way</Chip>}
          </p>
        )}
      </div>
      {ready > 0 && (
        <ButtonLink href="/learn/new" variant="primary" className="w-full justify-center sm:w-auto">
          Learn {Math.min(ready, LEARN_BATCH)} words
        </ButtonLink>
      )}
    </div>
  );
}
