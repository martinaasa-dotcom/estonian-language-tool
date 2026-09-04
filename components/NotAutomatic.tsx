import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { caseByKey } from "@/lib/estonian/cases";
import type { CaseKey } from "@/lib/estonian/types";
import { slotLabel, slotShort } from "@/lib/srs/slots";
import type { Confusion } from "@/lib/stats/confusions";
import type { SlotPace } from "@/lib/stats/pace";
import { formatAnswerTime } from "@/lib/time/duration";

/**
 * THE TWO THINGS AN ACCURACY CHART CANNOT SAY.
 *
 * Every other panel on this page counts answers. This one reads the two
 * columns that were being written and never read: how long an answer took, and
 * which form came back instead of the one asked for.
 *
 * They are drawn together because they are one story. "You get the seesütlev
 * right nine times in ten, and it takes you four seconds" and "you and the
 * seestütlev keep swapping places" are the same finding twice: a rule being
 * applied rather than a word being reached for. Split across two cards on a
 * page that already carries eight charts, neither would be read.
 *
 * IT DOES NOT REPEAT THE CASES PANEL. `WeakestCases` sits directly above and
 * names what is *wrong*; `FLUENT_ACCURACY` keeps this to what is right. A
 * learner reading both gets two different instructions, which is the only
 * reason to print two panels about one subject.
 *
 * BUTTER, BECAUSE THE SCHEDULER ALREADY CALLED IT THAT. A slow correct answer
 * is a Hard, and the palette has one hue for "nearly" (docs/14-design-system.md
 * section 1). Inventing a sixth to mean "right but slow" is what that document
 * forbids, and mint would say recalled, which overstates it.
 */

/** A row per slot, and per pair. Enough to act on, short enough to read. */
const MAX_ROWS = 5;

export function NotAutomatic({ slow, mixedUp, medianMs }: {
  slow: readonly SlotPace[];
  mixedUp: readonly Confusion[];
  /** The learner's own median, which is what "slow" is measured against. */
  medianMs: number | null;
}) {
  return (
    <div className="flex flex-col gap-5">
      {slow.length > 0 && (
        <div>
          <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            Right, but you think about it
          </p>
          <ul className="flex flex-col gap-1.5">
            {slow.slice(0, MAX_ROWS).map((s) => (
              <SlowRow key={s.slot} pace={s} />
            ))}
          </ul>
          {medianMs !== null && (
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              Against your own {formatAnswerTime(medianMs)} on everything else.
            </p>
          )}
        </div>
      )}

      {mixedUp.length > 0 && (
        <div>
          <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            Forms you swap
          </p>
          <ul className="flex flex-col gap-1.5">
            {mixedUp.slice(0, MAX_ROWS).map((c) => (
              <MixedRow key={c.pair.join(" ")} confusion={c} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * One slow form, as a way in to drilling it.
 *
 * A row is a control where the slot is a case, because `/review?case=` takes
 * one and that is the drill. A named part of the verb has no such door, so it
 * is a row and not a link rather than a link that goes somewhere vague.
 */
function SlowRow({ pace }: { pace: SlotPace }) {
  const spec = caseByKey(pace.slot as CaseKey);
  /*
    The short name on the row and the question in the label, which is the
    split `WeakestCases` makes one panel down. The long form ran past a phone
    and truncated its own question, and a row that says `saav` over a row
    that says `seesütlev` reads as one list; the question is one panel below,
    on the grammar page the link opens, and in the label a screen reader gets.
  */
  const name = slotShort(pace.slot);
  const full = slotLabel(pace.slot);
  const time = formatAnswerTime(pace.medianMs);
  const inside = (
    <>
      <span lang="et" className="min-w-0 flex-1" style={{ color: "var(--ink-2)" }}>
        {name}
      </span>
      <span className="tnum shrink-0 text-sm font-semibold" style={{ color: "var(--butter-ink)" }}>
        {time}
      </span>
      <span className="tnum w-20 shrink-0 text-right text-xs" style={{ color: "var(--ink-3)" }}>
        {pace.accuracy}% of {pace.answers}
      </span>
    </>
  );

  const label =
    `${full}: right ${pace.accuracy} percent of ${pace.answers} timed answers, ` +
    `taking ${time} each`;

  return (
    <li className="flex min-w-0 items-center">
      {spec ? (
        <Link
          href={`/review?case=${pace.slot}`}
          aria-label={`${label}. Drill it.`}
          className="pill tap-tint flex min-w-0 flex-1 items-center gap-3 rounded-[var(--r)] px-2 py-1.5 text-sm"
        >
          {inside}
        </Link>
      ) : (
        <span aria-label={label} className="flex min-w-0 flex-1 items-center gap-3 px-2 py-1.5 text-sm">
          {inside}
        </span>
      )}
    </li>
  );
}

/**
 * One pair, both directions counted together.
 *
 * The arrow is a typographic glyph doing a job, which is the exception the
 * emoji rule draws for the one in "Estonian to English". It says nothing to a
 * screen reader, so the label spells the pair out in words. Written as the
 * character rather than as `&#8596;`, because an entity is a hex-shaped string
 * and the rule that no component carries a raw colour reads it as one.
 */
function MixedRow({ confusion }: { confusion: Confusion }) {
  const [a, b] = confusion.pair;
  const first = slotShort(a);
  const second = slotShort(b);
  return (
    <li className="flex min-w-0 items-center gap-3 px-2 py-1.5 text-sm">
      <span
        lang="et"
        className="min-w-0 flex-1"
        aria-label={`${slotLabel(a)} and ${slotLabel(b)}, swapped ${confusion.times} times`}
      >
        {first} <span aria-hidden style={{ color: "var(--ink-3)" }}>↔</span> {second}
      </span>
      <span className="tnum shrink-0 text-xs" style={{ color: "var(--ink-3)" }}>
        {confusion.times} times
      </span>
    </li>
  );
}
