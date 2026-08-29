import Link from "next/link";
import { Check, Compass, Lock } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { deckSnapshot, pathWithProgress } from "@/lib/progress/summary";
import { readSetting, SETTING_KEYS } from "@/lib/settings/store";
import {
  CHECKPOINTS, LEVELS, LEVEL_INFO, isUnitOpen, nextUnit, type Level,
} from "@/lib/collections/syllabus";
import { ButtonLink } from "@/components/Button";
import { icon } from "@/components/icons";
import { Chip, Meter, Page, Ring } from "@/components/ui";

export const dynamic = "force-dynamic";

const isLevel = (value: string | null): value is Level =>
  value !== null && (LEVELS as readonly string[]).includes(value);

/**
 * The course.
 *
 * Eighty-four units is far too many for one list, so the page is the six CEFR
 * levels and each one opens. The learner's own level is open on arrival and the
 * rest are shut — which is also the honest shape of the thing, because a level
 * is the unit of progress a learner actually cares about. "Four units into B1"
 * means something; "unit 31 of 84" does not.
 *
 * Progress is computed from the deck (lib/progress/summary.ts), so a unit fills
 * up as its words are genuinely learned rather than as they are clicked on.
 */
export default async function LearnPage() {
  const ownerId = await requireUserId();
  const [snapshot, placementSetting] = await Promise.all([
    deckSnapshot(ownerId),
    readSetting(ownerId, SETTING_KEYS.cefrPlacement),
  ]);
  const units = await pathWithProgress(ownerId, snapshot);
  const placement: Level = isLevel(placementSetting) ? placementSetting : "A1";

  const doneIds = new Set(units.filter((u) => u.state === "done").map((u) => u.unit.id));
  const startedIds = new Set(units.filter((u) => u.state === "learning").map((u) => u.unit.id));
  const next = nextUnit({ doneUnitIds: doneIds, startedUnitIds: startedIds, placement });

  const totalWords = units.reduce((sum, u) => sum + u.available, 0);
  const knownWords = units.reduce((sum, u) => sum + u.known, 0);
  const overall = totalWords > 0 ? Math.round((knownWords / totalWords) * 100) : 0;

  const byLevel = LEVELS.map((level) => {
    const rows = units.filter((u) => u.unit.level === level);
    const words = rows.reduce((sum, u) => sum + u.available, 0);
    const known = rows.reduce((sum, u) => sum + u.known, 0);
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
      title="The course"
      lead="Six levels, A1 to C2. Every unit teaches a lesson first, then puts its words into your review deck with real audio and full paradigms."
    >
      <div
        className="mb-7 flex flex-wrap items-center gap-5 rounded-[var(--r-lg)] border p-5"
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
            A word counts as known once every card made from it has graduated in the scheduler,
            not just answered right once.
          </p>
          <Link
            href="/placement"
            className="mt-1.5 inline-flex items-center gap-1.5 text-xs underline"
            style={{ color: "var(--accent-deep)" }}
          >
            <Compass size={13} aria-hidden /> Not sure? Take the placement test
          </Link>
        </div>
        {next && (
          <ButtonLink href={`/learn/${next.id}/lesson`} variant="primary">
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
              <summary className="flex min-h-[56px] cursor-pointer flex-wrap items-center gap-4 p-4">
                <span
                  className="tnum flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                  style={{
                    background: finished ? "var(--mint)" : pct > 0 ? "var(--accent)" : "var(--raised)",
                    color: finished || pct > 0 ? "var(--surface)" : "var(--ink-3)",
                  }}
                >
                  {finished ? <Check size={20} aria-hidden /> : level}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span lang="et" className="est text-lg font-bold" style={{ color: "var(--ink)" }}>
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
                      className="flex flex-wrap items-center gap-4 rounded-[var(--r-md)] border p-3"
                      style={{
                        borderColor: complete ? "var(--mint)" : u.state === "learning" ? "var(--accent)" : "var(--rule)",
                        background: "var(--surface)",
                        opacity: locked ? 0.6 : 1,
                      }}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                        style={{
                          background: complete ? "var(--mint)" : u.state === "learning" ? "var(--accent)" : "var(--raised)",
                          color: complete || u.state === "learning" ? "var(--surface)" : "var(--ink-3)",
                        }}
                      >
                        {locked ? <Lock size={16} aria-hidden /> : complete ? <Check size={18} aria-hidden /> : <Icon size={17} aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <Link
                          href={`/learn/${u.unit.id}`}
                          lang="et"
                          className="est text-md font-bold hover:underline"
                          style={{ color: "var(--ink)" }}
                        >
                          {u.unit.title}
                        </Link>
                        <span className="block max-w-[62ch] text-sm" style={{ color: "var(--ink-2)" }}>
                          {u.unit.canDo}
                        </span>
                        {locked && (
                          <span className="mt-1 block text-xs" style={{ color: "var(--ink-3)" }}>
                            Builds on {u.unit.requires.join(", ")}. You can still open it.
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
                    className="flex flex-wrap items-center gap-4 rounded-[var(--r-md)] border border-dashed p-3"
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
        Units are shortcuts into the same dictionary, not a separate course, everything in them can
        also be found by searching, and anything the dictionary is missing you can{" "}
        <Link href="/dictionary" className="underline" style={{ color: "var(--accent-deep)" }}>add yourself</Link>.
        Nothing is ever truly locked: a unit above your level shows what it builds on, and opens anyway.
      </p>
    </Page>
  );
}
