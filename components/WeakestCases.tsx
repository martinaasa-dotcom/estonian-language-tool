import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { CircleHelp } from "lucide-react";
import type { CaseAccuracy } from "@/lib/stats/history";
import { Meter } from "@/components/ui";

/**
 * The cases a learner keeps missing, worst first, with a way in to each.
 *
 * There were three of these. Progress drew bars with a question mark beside
 * them, Practice drew the same bars with a different width and label, and My
 * words drew its own smaller version with a sprint link under it. Worse than
 * the markup: My words tallied the reviews itself in a local function instead
 * of calling `caseAccuracy`, so the same learner could read two different
 * numbers for the same case on two screens, and nothing in the app would
 * disagree with either.
 *
 * It carries `tap-tint` because a row here is a control: it tints and lifts
 * under the pointer rather than fading, which is what every other selectable
 * option in the app does since the sweep that made them look selectable. That
 * arrived on main while this component was being extracted, on two of the three
 * copies it replaces, so it is ported here rather than lost to a clean merge.
 *
 * One component, one calculation, and the best of the three affordances kept:
 * two destinations per row, because the bar drills a case and the question mark
 * explains it. Side by side rather than stacked, since drilling a case you have
 * not understood yet only fails faster, so the way out has to be visible
 * without turning the list into two lines per case.
 */
export function WeakestCases({ cases, empty }: {
  cases: CaseAccuracy[];
  /** What to say when there is nothing to show. Each screen phrases its own. */
  empty: React.ReactNode;
}) {
  if (cases.length === 0) return <>{empty}</>;

  return (
    <ul className="flex flex-col gap-2">
      {cases.map((c) => {
        const name = c.grammCase.toLowerCase();
        return (
          <li key={c.grammCase} className="flex min-w-0 items-center gap-1">
            <Link
              href={`/review?case=${c.grammCase}`}
              aria-label={`Drill the ${name}, currently ${c.accuracy} percent over ${c.total} reviews`}
              className="tap-tint flex min-w-0 flex-1 items-center gap-3 rounded-[var(--r)] px-2 py-1.5 text-sm"
            >
              {/*
                A width to line the names up at, not a width to hold at any
                cost. Ninety-six pixels for the name, sixty-four for the
                figure and twenty-eight for the help link came to more than
                this card has inside it at 768, where the rail is drawn and
                the column is at its narrowest: the row ran 37px past the
                card's right border, and the page drawn after it was on top
                of the help link. The case names are one word, so a name that
                has to give up a few pixels still reads.
              */}
              <span className="w-24 shrink" style={{ color: "var(--ink-2)" }}>{name}</span>
              <span className="min-w-0 flex-1">
                <Meter
                  pct={c.accuracy}
                  label={`${name}: ${c.accuracy}%`}
                  tone={c.accuracy >= 85 ? "var(--good)" : c.accuracy >= 65 ? "var(--hard)" : "var(--again)"}
                  height={5}
                />
              </span>
              <span className="tnum w-16 shrink-0 text-right text-xs" style={{ color: "var(--ink-3)" }}>
                {c.accuracy}% · {c.total}
              </span>
            </Link>
            <Link
              href={`/grammar/${name}`}
              aria-label={`What the ${name} is for`}
              title={`What the ${name} is for`}
              className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
              style={{ color: "var(--ink-3)" }}
            >
              <CircleHelp size={14} aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
