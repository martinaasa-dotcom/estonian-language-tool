"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Confetti } from "@/components/Confetti";
import type { Badge } from "@/lib/achievements/badges";
import { badgeIcon } from "./icons";

/**
 * A stack of badge-earned toasts plus a confetti burst. `badges` is expected to
 * change identity only when the server has genuinely awarded something new —
 * checkAchievements() is idempotent, so re-passing the same (empty) list on
 * every render never re-triggers this.
 *
 * Three at a time, and they go away on their own.
 *
 * The stack was unbounded and nothing retired a toast but a click on its own
 * small X, so the moment it was worst was the moment it mattered most: the end
 * of somebody's first ever session, when the first review, the first day, the
 * first quests and a level all land together. Five cards then covered the right
 * hand column of the page they had just earned them on, and clearing them was
 * five separate presses. A reward you have to tidy up after is not a reward.
 *
 * So the newest three are shown, anything behind them is one counted line, and
 * each retires itself after nine seconds. Nothing is lost by that: the shelf in
 * Settings holds every badge, earned or not, for as long as the account exists.
 */
const VISIBLE = 3;
const LINGER_MS = 9000;

export function AchievementToasts({ badges }: { badges: Badge[] }) {
  const [queue, setQueue] = useState<Badge[]>([]);
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (badges.length === 0) return;
    setQueue((q) => [...q, ...badges]);
    setBurst(true);
    const t = setTimeout(() => setBurst(false), 2000);
    return () => clearTimeout(t);
  }, [badges]);

  // One timer for the oldest toast rather than one per toast: they arrive
  // together, and a timer per card means a queue that empties in a stutter.
  useEffect(() => {
    if (queue.length === 0) return;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), LINGER_MS);
    return () => clearTimeout(t);
  }, [queue]);

  if (queue.length === 0) return null;

  const shown = queue.slice(0, VISIBLE);
  const hidden = queue.length - shown.length;

  return (
    <>
      {burst && <Confetti />}
      <div
        className="bottom-notice fixed right-5 z-[90] flex w-[min(92vw,340px)] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {hidden > 0 && (
          <p
            className="rounded-full px-4 py-2 text-center text-xs font-semibold"
            style={{ background: "var(--raised)", color: "var(--ink-2)" }}
          >
            {hidden} more badge{hidden === 1 ? "" : "s"} earned, all of them on the shelf in Settings.
          </p>
        )}
        {shown.map((b) => {
          const Icon = badgeIcon(b.icon);
          return (
            <div
              key={b.key}
              className="flex items-start gap-3 rounded-[var(--r-lg)] border p-4"
              style={{
                borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)",
                animation: "toast-in 0.25s ease-out",
              }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
              >
                <Icon size={18} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="label-xs" style={{ color: "var(--ink-3)" }}>Badge earned</p>
                <p className="est text-base font-semibold" style={{ color: "var(--ink)" }}>{b.title}</p>
                <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>{b.description}</p>
              </div>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setQueue((q) => q.filter((x) => x.key !== b.key))}
                className="shrink-0 rounded-md p-1"
                style={{ color: "var(--ink-3)" }}
              >
                <X size={15} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
