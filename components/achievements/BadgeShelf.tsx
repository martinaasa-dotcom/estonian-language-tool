import { BADGES } from "@/lib/achievements/badges";
import { badgeIcon } from "./icons";

export function BadgeShelf({ earnedKeys }: { earnedKeys: Set<string> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {BADGES.map((b) => {
        const earned = earnedKeys.has(b.key);
        const Icon = badgeIcon(b.icon);
        return (
          <div
            key={b.key}
            className={`flex flex-col items-center gap-2 rounded-[var(--r-lg)] p-4 text-center ${earned ? "lift" : ""}`}
            style={{
              background: earned ? "var(--accent-soft)" : "transparent",
              border: earned ? "1px solid transparent" : "1px dashed var(--rule)",
              opacity: earned ? 1 : 0.75,
            }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{
                background: earned ? "var(--surface)" : "transparent",
                color: earned ? "var(--accent-deep)" : "var(--ink-3)",
                boxShadow: earned ? "var(--shadow-sm)" : "none",
              }}
            >
              <Icon size={19} aria-hidden />
            </span>
            <p className="est text-sm font-semibold leading-tight" style={{ color: earned ? "var(--ink)" : "var(--ink-2)" }}>
              {b.title}
            </p>
            <p className="text-2xs leading-snug" style={{ color: "var(--ink-3)" }}>{b.description}</p>
          </div>
        );
      })}
    </div>
  );
}
