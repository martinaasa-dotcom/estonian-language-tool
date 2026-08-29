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
 */
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

  if (queue.length === 0) return null;

  return (
    <>
      {burst && <Confetti />}
      <div
        className="bottom-notice fixed right-5 z-[90] flex w-[min(92vw,340px)] flex-col gap-2"
        role="status"
        aria-live="polite"
      >
        {queue.map((b) => {
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
