import Link from "next/link";
import {
  CUMULATIVE_HOURS, FACTS, FOUND_HOURS_PER_WEEK, project, sustainableNewCardsPerDay,
  weeksNeeded, type Projection,
} from "@/lib/assessment/plan";
import { targetByBand, weeksUntil, type Goals } from "@/lib/assessment/goals";
import { formatDuration, formatDurationRange } from "@/lib/time/duration";
import { PRE_A1, type Band, type Level } from "@/lib/assessment/types";
import { Card, Note, SectionTitle, StatTile } from "@/components/ui";
import { icon } from "@/components/icons";

/**
 * The honest timeline.
 *
 * This is the screen the rest of the feature exists for. A level on its own is
 * trivia; a level, a goal and a deadline together are a plan, and the useful
 * thing an app can do with them is arithmetic nobody enjoys: this many hours,
 * at your pace that is this many weeks, which is or is not before the date you
 * gave. Every number carries where it came from, and the ranges stay ranges.
 *
 * It never tells a learner they cannot do something. It tells them what the
 * published hours say, what their own stated pace covers, and what would have
 * to change. Those are facts they can act on. "Not possible" is not.
 */

export function levelLabel(level: Level | null): string {
  if (level === null) return "not measured";
  return level === PRE_A1 ? "below A1" : level;
}

/**
 * A range, with the unit left off when the tile above it already says it.
 *
 * The unit used to be interpolated unconditionally, so the two tiles that pass
 * an empty one rendered "880 to 1170 " with a space hanging off the end of the
 * number.
 */
function range(low: number, high: number, unit: string): string {
  const body = low === high ? `${low}` : `${low} to ${high}`;
  return unit ? `${body} ${unit}` : body;
}

/**
 * The hours a whole deadline's worth of daily goals adds up to.
 *
 * One decimal place, and it stays a bare number because the sentence around it
 * supplies the unit: "about 43.3 of those hours". `formatDuration` is what the
 * small weekly figures get, since an hour is the wrong unit for nine minutes;
 * this one is never below an hour and a bit, so hours is what it is read in.
 *
 * The projection keeps every figure exact precisely so that a number shaped
 * for a screen never becomes a divisor. Rounding happens here, on the way out.
 */
function hours1(n: number): number {
  return Math.round(n * 10) / 10;
}

const VERDICT: Record<Projection["verdict"], { tone: "neutral" | "good" | "warn"; headline: string }> = {
  arrived: { tone: "good", headline: "You are already there, on this measurement." },
  comfortable: { tone: "good", headline: "Your own pace covers it, with room to spare." },
  tight: { tone: "warn", headline: "It fits, but only with study outside this app." },
  short: { tone: "warn", headline: "Not by that date, at that pace. Here is what would change it." },
  open: { tone: "neutral", headline: "No deadline set, so here is what the distance looks like." },
  passed: { tone: "neutral", headline: "That date has gone by. Set a new one and this is a plan again." },
};

export function PlanPanel({ level, goals, dailyGoal, now = new Date(), compact = false }: {
  /** Where the learner is. Null when they have not been measured yet. */
  level: Level | null;
  goals: Goals;
  dailyGoal: number;
  now?: Date;
  /**
   * The verdict and the four figures, without the working behind them.
   *
   * First run is where this panel is most useful and least readable: an essay
   * on where the hours come from and six cited facts, under the four questions
   * that produced them, is a screen nobody finishes on the evening they
   * install something. The arithmetic is the part that changes a decision, so
   * that is the part that stays; the working is on the level check screen,
   * linked from the bottom, where somebody who wants to argue with a number
   * can go and find it.
   */
  compact?: boolean;
}) {
  const target = goals.target ?? null;
  const from: Level = level ?? PRE_A1;
  const weeks = weeksUntil(goals.deadline, now);

  if (!target) {
    return (
      <Card>
        <SectionTitle>Your plan</SectionTitle>
        <p className="text-base" style={{ color: "var(--ink-2)" }}>
          Pick a level to aim for and this becomes a timeline: how many hours the distance usually
          takes, how many of them your daily goal covers, and how many are left to find elsewhere.
        </p>
        <Link
          href="/settings#goals"
          className="mt-4 inline-block text-sm underline underline-offset-2"
          style={{ color: "var(--accent-deep)" }}
        >
          Set a goal
        </Link>
      </Card>
    );
  }

  const plan = project({
    from,
    to: target,
    minutesPerDay: minutesFor(dailyGoal),
    daysPerWeek: goals.daysPerWeek,
    weeksAvailable: weeks,
  });
  const verdict = VERDICT[plan.verdict];
  const spec = targetByBand(target);
  const newCards = sustainableNewCardsPerDay(dailyGoal);
  /*
    The date this pace would actually land on with a normal amount of study
    found elsewhere. It is the same constant the verdict band is drawn at, so
    the headline above and this sentence can never disagree again.
  */
  const found = weeksNeeded(plan.hours, plan.appHoursPerWeek, FOUND_HOURS_PER_WEEK);

  return (
    <div className="flex flex-col gap-4">
      <Card tone={verdict.tone === "good" ? "accent" : verdict.tone === "warn" ? "butter" : "sky"}>
        <p className="est text-xl font-bold leading-snug" style={{ color: "var(--ink)" }}>
          {verdict.headline}
        </p>
        <p className="mt-2 max-w-[62ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {sentence(plan, weeks, levelLabel(from), target)}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          value={plan.hours.low === 0 ? "0" : range(plan.hours.low, plan.hours.high, "")}
          label="Study hours to go"
          tone="accent"
          hint="published estimates, not this app"
        />
        <StatTile
          value={formatDuration(plan.appHoursPerWeek)}
          label="From this app a week"
          tone="sky"
          hint={`${minutesFor(dailyGoal)} minutes, ${goals.daysPerWeek} days`}
        />
        <StatTile
          value={plan.weeksOnAppAlone.low === 0 ? "0" : range(plan.weeksOnAppAlone.low, plan.weeksOnAppAlone.high, "")}
          label="Weeks on the app alone"
          tone="blush"
          hint="which is why it is not the whole plan"
        />
        <StatTile
          value={weeks === null ? "open" : `${weeks}`}
          label="Weeks until your date"
          tone="butter"
          hint={weeks === null ? "no deadline set" : weeks === 0 ? "that date has gone" : "from today"}
        />
      </div>

      {plan.otherHoursPerWeek && plan.otherHoursPerWeek.high > 0 && (
        <Note tone="sky">
          To make that date you would need roughly{" "}
          <strong>
            {formatDurationRange(plan.otherHoursPerWeek.low, plan.otherHoursPerWeek.high, "long")} a week
          </strong>{" "}
          of Estonian beyond this app: a class, a conversation partner, reading, a film without
          subtitles. At a found {FOUND_HOURS_PER_WEEK} hours a week on top of your daily goal, the
          distance is about {range(found.low, found.high, "weeks")}.
        </Note>
      )}

      {compact && (
        <p className="text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
          Published estimates for an English speaker, which are averages of other people on other
          courses rather than a measurement of you.{" "}
          <Link href="/assess" className="underline underline-offset-2" style={{ color: "var(--accent-deep)" }}>
            Where the numbers come from
          </Link>
          , and the research behind the pace, are on the level check screen.
        </p>
      )}

      {!compact && (
      <Card>
        <SectionTitle hint="what the numbers assume">Where these come from</SectionTitle>
        <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          {target} sits at roughly {range(CUMULATIVE_HOURS[target].low, CUMULATIVE_HOURS[target].high, "hours")} of
          study from nothing, for an English speaker. Estonian is at the harder end of the scale, so
          these are above the figures usually quoted for French or Spanish. They are averages across
          other people, on other courses. They are not a measurement of you, and once you have a few
          weeks of reviews here the app can show you your own pace instead.
        </p>
        {spec && (
          <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            <strong>{target}, {spec.label.toLowerCase()}.</strong> {spec.can} What it still will not
            get you: {lowerFirst(spec.cannot)}
          </p>
        )}
        <p className="mt-3 text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
          A daily goal of {dailyGoal} cards settles at about {newCards} genuinely new{" "}
          {newCards === 1 ? "card" : "cards"} a day once the reviews arrive, because a card you learn
          today costs roughly ten reviews over its first year. Setting the goal higher does not make
          the words arrive faster, it makes week six unbearable.
        </p>
      </Card>
      )}

      {!compact && (
      <div>
        <SectionTitle hint="checkable, not motivational">Facts worth knowing first</SectionTitle>
        <ul className="flex flex-col gap-3">
          {FACTS.map((fact) => {
            const Icon = icon(fact.icon);
            return (
              <li key={fact.id}>
                <Card className="flex gap-4">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                    style={{ background: "var(--raised)", color: "var(--ink-2)" }}
                  >
                    <Icon size={17} aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>{fact.claim}</p>
                    <p className="mt-1.5 text-xs" style={{ color: "var(--ink-3)" }}>{fact.source}</p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>
      )}
    </div>
  );
}

/**
 * Review minutes implied by a daily card goal.
 *
 * Three cards a minute is the pace the typed review mode actually runs at here,
 * counting the thinking. It is deliberately not generous: a plan built on an
 * optimistic minutes figure is a plan that quietly doubles its own timeline.
 */
export function minutesFor(dailyGoal: number): number {
  return Math.max(1, Math.round(dailyGoal / 3));
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function sentence(plan: Projection, weeks: number | null, from: string, to: Band): string {
  if (plan.verdict === "arrived") {
    return `Your measured level is already ${to} or above. Pick a higher target, or keep the deck warm and sit the check again in a couple of months.`;
  }
  const distance = `Going from ${from} to ${to} is usually ${range(plan.hours.low, plan.hours.high, "hours")} of study.`;
  const pace = formatDuration(plan.appHoursPerWeek, "long");
  if (weeks === null) {
    return `${distance} At your stated pace this app covers ${pace} a week of that, so set a date and the rest of this becomes a real timeline.`;
  }
  /*
    A date behind them divides by nothing, so it gets the distance and the pace
    and no arithmetic over the deadline at all.
  */
  if (plan.verdict === "passed") {
    return `${distance} At your stated pace this app covers ${pace} a week of that. Pick a date you can still get to and this becomes a timeline again.`;
  }
  const covered = hours1(plan.appHoursAvailable ?? 0);
  if (plan.verdict === "comfortable") {
    return `${distance} In ${weeks} weeks your daily goal alone puts in about ${covered} hours, which covers it.`;
  }
  return `${distance} In ${weeks} weeks your daily goal puts in about ${covered} of those hours. The rest has to come from somewhere else, or the date has to move.`;
}
