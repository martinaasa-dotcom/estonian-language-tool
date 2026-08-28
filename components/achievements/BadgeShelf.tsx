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
            className="flex flex-col items-center gap-2 rounded-lg border p-4 text-center"
            style={{
              borderColor: "var(--rule)",
              background: earned ? "var(--accent-soft)" : "var(--raised)",
              opacity: earned ? 1 : 0.55,
            }}
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: earned ? "var(--surface)" : "transparent", color: earned ? "var(--accent)" : "var(--ink-3)" }}
            >
              <Icon size={19} aria-hidden />
            </span>
            <p className="est text-[13.5px] font-semibold leading-tight" style={{ color: earned ? "var(--ink)" : "var(--ink-2)" }}>
              {b.title}
            </p>
            <p className="text-[11.5px] leading-snug" style={{ color: "var(--ink-3)" }}>{b.description}</p>
          </div>
        );
      })}
    </div>
  );
}
