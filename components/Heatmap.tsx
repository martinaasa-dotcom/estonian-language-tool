import type { DayBucket } from "@/lib/stats/history";

const LEVEL_COLOR: Record<number, string> = {
  0: "var(--raised)",
  1: "color-mix(in srgb, var(--accent) 25%, var(--raised))",
  2: "color-mix(in srgb, var(--accent) 50%, var(--raised))",
  3: "color-mix(in srgb, var(--accent) 75%, var(--raised))",
  4: "var(--accent)",
};

/**
 * A contribution grid of the last six months.
 *
 * Columns are weeks, rows are weekdays, starting on Monday — the Estonian week,
 * and the one on every school timetable here. The grid is padded at the front so
 * the first column lines up with the right weekday rather than starting wherever
 * the window happens to open.
 *
 * It scrolls horizontally inside its own box: a heatmap that makes the whole
 * page scroll sideways on a phone is worse than no heatmap.
 */
export function Heatmap({ days }: { days: DayBucket[] }) {
  const first = days[0];
  if (!first) return null;

  const firstDate = new Date(`${first.day}T00:00:00`);
  // getDay(): 0 is Sunday. Monday-first means Sunday sits at the bottom, row 6.
  const pad = (firstDate.getDay() + 6) % 7;
  const cells: (DayBucket | null)[] = [...Array<null>(pad).fill(null), ...days];
  const weeks: (DayBucket | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const total = days.reduce((sum, d) => sum + d.count, 0);
  const active = days.filter((d) => d.count > 0).length;

  return (
    <div>
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-[3px]" style={{ minWidth: weeks.length * 13 }}>
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {Array.from({ length: 7 }, (_, di) => {
                const cell = week[di] ?? null;
                if (!cell) return <span key={di} className="block h-[10px] w-[10px]" aria-hidden />;
                return (
                  <span
                    key={di}
                    /* 2px, not a token radius: at 10px square anything larger
                       rounds the cell into a dot and the grid stops reading as
                       a calendar. Data cells are the one exception (docs §2). */
                    className="block h-[10px] w-[10px] rounded-[2px]"
                    style={{ background: LEVEL_COLOR[cell.level] }}
                    title={`${cell.day}: ${cell.count} review${cell.count === 1 ? "" : "s"}`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-2xs" style={{ color: "var(--ink-3)" }}>
        <span>{total} reviews on {active} days in the last {days.length}</span>
        <span className="ml-auto flex items-center gap-1.5">
          Quiet
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className="block h-[10px] w-[10px] rounded-[2px]" style={{ background: LEVEL_COLOR[l] }} aria-hidden />
          ))}
          Busy
        </span>
      </div>
    </div>
  );
}
