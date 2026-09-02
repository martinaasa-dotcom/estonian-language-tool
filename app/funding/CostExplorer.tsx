"use client";

import { useMemo, useState } from "react";
import { Meter } from "@/components/ui";
import { ChoiceChip, ChoiceGroup } from "@/components/Choice";
import {
  ASSUMPTIONS, DEFAULT_SHAPE, SCALE_LADDER, TUTOR_CAP_USD,
  billFor, ladderFor, type Meter as MeterFigure, type Shape, type TutorMode,
} from "@/lib/funding/model";

/**
 * The bill, with the size of the thing left to the reader.
 *
 * Everything above this on the page is a number we chose. This is the part
 * where somebody who thinks we chose wrongly can say so and see what it does,
 * which is the only version of "open about what it costs" that survives
 * contact with a reader who does not trust us yet.
 *
 * One slider carries it, because there is one question: how many people. The
 * rest are chips, and each one is there because it moves the total by enough
 * to argue about. Nothing here is a preference to be remembered; it is a
 * question being asked of the arithmetic, so none of it is stored and a reload
 * puts it back where it started.
 */

/** Where the slider's hundred stops land: one learner up to a hundred thousand. */
const STOPS = 100;
const DECADES = 5;

function learnersAt(stop: number): number {
  const raw = Math.pow(10, (stop / STOPS) * DECADES);
  if (raw < 10) return Math.max(1, Math.round(raw));
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)) - 1);
  return Math.round(raw / magnitude) * magnitude;
}

function stopFor(learners: number): number {
  return Math.round((Math.log10(Math.max(1, learners)) / DECADES) * STOPS);
}

const count = (n: number) => Math.round(n).toLocaleString("en-GB");

function money(usd: number): string {
  if (usd >= 1000) return `$${Math.round(usd).toLocaleString("en-GB")}`;
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  return usd === 0 ? "nothing" : `$${usd.toFixed(2)}`;
}

/**
 * The per-learner figure, in whatever unit stops it reading as zero.
 *
 * It runs from about two and a half dollars to under a penny across the range
 * this page covers, and `$0.0083` is a number a reader has to count the noughts
 * on. Cents below a dollar is the same rule `lib/time/duration.ts` applies to a
 * stretch of study: the unit is part of the number.
 */
function perLearner(usd: number): string {
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  const cents = usd * 100;
  if (cents >= 10) return `${Math.round(cents)} cents`;
  if (cents >= 0.1) return `${cents.toFixed(1)} cents`;
  return "under a tenth of a cent";
}

function amount(figure: MeterFigure): string {
  if (figure.as === "gb") {
    const gb = figure.used;
    if (gb < 1) return `${Math.round(gb * 1000)} MB`;
    if (gb < 1000) return `${gb.toFixed(1)} GB`;
    return `${(gb / 1000).toFixed(1)} TB`;
  }
  if (figure.as === "hours") {
    return figure.used < 1
      ? `${Math.round(figure.used * 60)} min`
      : `${count(figure.used)} hours`;
  }
  return count(figure.used);
}

function allowance(figure: MeterFigure): string {
  if (figure.included === 0) return "no allowance to be over";
  return figure.as === "gb"
    ? `${figure.included < 1 ? `${figure.included * 1000} MB` : `${count(figure.included)} GB`} included`
    : figure.as === "hours"
      ? `${count(figure.included)} hours included`
      : `${count(figure.included)} included`;
}

export function CostExplorer() {
  const [shape, setShape] = useState<Shape>(DEFAULT_SHAPE);
  const set = <K extends keyof Shape>(key: K, value: Shape[K]) =>
    setShape((was) => ({ ...was, [key]: value }));

  const bill = useMemo(() => billFor(shape), [shape]);
  const ladder = useMemo(() => ladderFor(shape), [shape]);
  const tallest = Math.max(...ladder.map((r) => r.bill.totalUsd), 1);

  return (
    <div className="space-y-6">
      <div
        className="rounded-[var(--r-lg)] border p-5"
        style={{ background: "var(--surface)", borderColor: "var(--rule)", boxShadow: "var(--shadow-sm)" }}
      >
        <label htmlFor="learners" className="label-xs block" style={{ color: "var(--ink-3)" }}>
          People using it in a month
        </label>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="tnum text-3xl font-bold leading-none" style={{ color: "var(--ink)" }}>
            {count(shape.learners)}
          </span>
          <span className="text-sm" style={{ color: "var(--ink-3)" }}>
            {shape.learners === 1 ? "one person, on their own machine" : "learners"}
          </span>
        </div>

        <input
          id="learners"
          type="range"
          className="range mt-1"
          min={0}
          max={STOPS}
          step={1}
          value={stopFor(shape.learners)}
          onChange={(e) => set("learners", learnersAt(Number(e.target.value)))}
          aria-valuetext={`${count(shape.learners)} learners`}
        />
        {/*
          One label per decade, because the slider is logarithmic and evenly
          spaced labels are only honest if they are evenly spaced *in the thing
          being measured*. The first version read 1, 100, 10,000, 100,000 across
          a justified row, which put 100 at the halfway mark on a scale where it
          sits at two fifths, on a page whose whole argument is that its numbers
          can be checked.
        */}
        <p aria-hidden className="tnum flex justify-between text-xs" style={{ color: "var(--ink-3)" }}>
          <span>1</span><span>10</span><span>100</span><span>1k</span><span>10k</span><span>100k</span>
        </p>

        <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--rule)" }}>
          <p className="label-xs" style={{ color: "var(--ink-3)" }}>Every month, all of it</p>
          <p className="tnum mt-1 text-4xl font-bold leading-none" style={{ color: "var(--accent-deep)" }}>
            {money(bill.totalUsd)}
          </p>
          <p className="mt-2 text-sm" style={{ color: "var(--ink-2)" }}>
            {perLearner(bill.perLearnerUsd)} a learner. In US dollars, because that is what
            the hosting bills arrive in.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceGroup label="Who is running it" select="one">
          <ChoiceChip selected={!shape.commercial} onSelect={() => set("commercial", false)}>
            A person
          </ChoiceChip>
          <ChoiceChip selected={shape.commercial} onSelect={() => set("commercial", true)}>
            A school or a company
          </ChoiceChip>
        </ChoiceGroup>

        <ChoiceGroup label="How hard they study" select="one">
          {([
            [3, 10, "Lightly"],
            [5, 15, "The default"],
            [7, 30, "Hard"],
          ] as const).map(([days, reviews, name]) => (
            <ChoiceChip
              key={name}
              selected={shape.sessionsPerWeek === days && shape.reviewsPerSession === reviews}
              onSelect={() => setShape((was) => ({
                ...was, sessionsPerWeek: days, reviewsPerSession: reviews,
              }))}
            >
              {name}
            </ChoiceChip>
          ))}
        </ChoiceGroup>

        <ChoiceGroup label="Cards read themselves aloud" select="one">
          <ChoiceChip selected={shape.audio} onSelect={() => set("audio", true)}>On</ChoiceChip>
          <ChoiceChip selected={!shape.audio} onSelect={() => set("audio", false)}>Off</ChoiceChip>
        </ChoiceGroup>

        <ChoiceGroup label="The tutor" select="one">
          {([
            ["free", "Free models"],
            ["paid", "A paid model"],
            ["off", "No key"],
          ] as const).map(([mode, name]) => (
            <ChoiceChip
              key={mode}
              selected={shape.tutor === mode}
              onSelect={() => set("tutor", mode as TutorMode)}
            >
              {name}
            </ChoiceChip>
          ))}
        </ChoiceGroup>

        <ChoiceGroup label="Years of reviews already stored" select="one">
          {[1, 3, 5, 10].map((years) => (
            <ChoiceChip key={years} even selected={shape.years === years} onSelect={() => set("years", years)}>
              {years}
            </ChoiceChip>
          ))}
        </ChoiceGroup>
      </div>

      {bill.tutorCapBinds && (
        <p
          className="rounded-[var(--r)] px-4 py-3 text-sm"
          style={{ background: "var(--butter-soft)", color: "var(--butter-ink)" }}
        >
          The tutor line stops at {money(TUTOR_CAP_USD)}, and it stops there in the running
          app too. The daily budget in <code>lib/usage/quota.ts</code> has no off switch,
          so this is a ceiling rather than a forecast.
        </p>
      )}

      {bill.freeTutorRunsOut && (
        <p
          className="rounded-[var(--r)] px-4 py-3 text-sm"
          style={{ background: "var(--sky-soft)", color: "var(--sky-ink)" }}
        >
          At this size the free models run out partway through each day. Anu goes quiet and
          says so. Nothing else in the app is touched, and the bill does not move.
        </p>
      )}

      <div>
        <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Where it goes</h3>
        <ul className="space-y-2">
          {bill.lines.map((line) => (
            <li
              key={line.id}
              className="rounded-[var(--r-lg)] border p-4"
              style={{ background: "var(--surface)", borderColor: "var(--rule)" }}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-base font-semibold" style={{ color: "var(--ink)" }}>
                  {line.service}
                </span>
                <span className="tnum text-base font-bold" style={{ color: line.usd > 0 ? "var(--ink)" : "var(--ink-3)" }}>
                  {money(line.usd)}
                </span>
              </div>
              <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>{line.plan}</p>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>{line.why}</p>

              {line.meters.some((m) => m.included > 0) && (
                <ul className="mt-3 space-y-2">
                  {line.meters.filter((m) => m.included > 0).map((figure) => {
                    const pct = (figure.used / figure.included) * 100;
                    const over = pct > 100;
                    return (
                      <li key={figure.label}>
                        <p className="tnum flex flex-wrap justify-between gap-x-2 text-xs" style={{ color: "var(--ink-3)" }}>
                          <span>{figure.label}</span>
                          <span>
                            {amount(figure)}
                            {" of "}
                            {allowance(figure)}
                          </span>
                        </p>
                        <div className="mt-1">
                          <Meter
                            pct={pct}
                            height={6}
                            label={`${figure.label}, ${amount(figure)} against ${allowance(figure)}`}
                            tone={over ? "var(--peach)" : "var(--accent)"}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>
          The same app at every size
        </h3>
        <p className="mb-3 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Each bar is ten times the learners of the one before it, and the heights are
          logarithmic, so a bar twice as tall is a bill many times larger. The shape to
          look at is the steps.
        </p>

        {/*
          The chart and its labels are two flex rows with the same children, so
          a bar and its number line up by construction rather than by a margin
          somebody guessed. Both are hidden from a reader using a screen reader,
          because the table underneath is the same six numbers said properly.

          The first version had no labels at all and sat flush against the
          table, which read as one object with a bar chart floating over its
          header: the eye tried to line the bars up with the columns, and they
          are not the same six things.
        */}
        <div aria-hidden>
          <div className="flex items-end gap-1.5" style={{ height: 96 }}>
            {ladder.map((rung) => {
              const height = Math.max(4, (Math.log10(rung.bill.totalUsd + 1) / Math.log10(tallest + 1)) * 100);
              const here = rung.learners === nearestRung(shape.learners);
              return (
                <span
                  key={rung.learners}
                  className="flex-1 rounded-t-[var(--r-sm)]"
                  style={{
                    height: `${height}%`,
                    background: here ? "var(--accent)" : "var(--accent-soft)",
                    border: `1px solid ${here ? "var(--accent)" : "var(--rule)"}`,
                    borderBottom: "none",
                  }}
                />
              );
            })}
          </div>
          <div className="flex gap-1.5 border-t pt-1" style={{ borderColor: "var(--rule)" }}>
            {ladder.map((rung) => (
              <span
                key={rung.learners}
                className="tnum flex-1 text-center text-xs"
                style={{
                  color: rung.learners === nearestRung(shape.learners) ? "var(--accent-deep)" : "var(--ink-3)",
                }}
              >
                {shorten(rung.learners)}
              </span>
            ))}
          </div>
        </div>

        <div className="scroll-host mt-5 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              What the app costs a month at each size, and what that is per learner
            </caption>
            <thead>
              <tr style={{ color: "var(--ink-3)" }}>
                <th scope="col" className="label-xs py-1 pr-3 text-left">Learners</th>
                <th scope="col" className="label-xs py-1 text-right">A month</th>
                <th scope="col" className="label-xs py-1 pl-3 pr-3 text-right">Each</th>
                <th scope="col" className="label-xs py-1 text-left">Database</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((rung) => (
                <tr
                  key={rung.learners}
                  className="border-t"
                  style={{
                    borderColor: "var(--rule)",
                    color: rung.learners === nearestRung(shape.learners) ? "var(--ink)" : "var(--ink-2)",
                    fontWeight: rung.learners === nearestRung(shape.learners) ? 600 : 400,
                  }}
                >
                  <td className="tnum py-1.5 pr-3">{count(rung.learners)}</td>
                  <td className="tnum py-1.5 text-right">{money(rung.bill.totalUsd)}</td>
                  <td className="tnum py-1.5 pl-3 pr-3 text-right">{perLearner(rung.bill.perLearnerUsd)}</td>
                  <td className="py-1.5 pl-3">
                    {rung.bill.lines.find((l) => l.id === "supabase")?.plan}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          The worst value is around ten people, not a hundred thousand. One person pays for
          a domain; ten are already past the free tier because ten learners&rsquo; worth of
          spoken words is more than a gigabyte. It then falls for three decades and steps
          back up, because the database instances go up in jumps a tenfold rise in learners
          does not always cover.
        </p>
      </div>

      <details className="rounded-[var(--r-lg)] border p-4" style={{ borderColor: "var(--rule)" }}>
        <summary className="cursor-pointer text-sm font-semibold" style={{ color: "var(--ink)" }}>
          The seven numbers nothing measured
        </summary>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
          Everything else on this page came off a stopwatch, a database or somebody&rsquo;s
          published price list. These are judgements, and they are here so you can disagree
          with a specific one rather than with the total.
        </p>
        <ul className="mt-3 space-y-3">
          {ASSUMPTIONS.map((a) => (
            <li key={a.id}>
              <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
                {a.what}: <span className="tnum">{a.value}</span> {a.unit}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed" style={{ color: "var(--ink-3)" }}>{a.why}</p>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/** A rung's learner count, short enough to sit under a bar on a phone. */
function shorten(learners: number): string {
  if (learners >= 1000) return `${learners / 1000}k`;
  return String(learners);
}

/** Which rung of the ladder the slider is nearest, for marking one of them. */
function nearestRung(learners: number): number {
  return SCALE_LADDER.reduce((best, rung) =>
    Math.abs(Math.log10(rung) - Math.log10(Math.max(1, learners)))
      < Math.abs(Math.log10(best) - Math.log10(Math.max(1, learners))) ? rung : best);
}
