import { BookCheck, Flame, Library, Repeat, Sparkles, Target, Trophy, Zap, type LucideIcon } from "lucide-react";

/** Maps a Badge's `icon` field (lib/achievements/badges.ts) to its component. */
export const BADGE_ICONS: Record<string, LucideIcon> = {
  Sparkles, Flame, Repeat, BookCheck, Library, Target, Trophy, Zap,
};

export function badgeIcon(name: string): LucideIcon {
  return BADGE_ICONS[name] ?? Trophy;
}
