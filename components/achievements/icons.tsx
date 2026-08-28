import type { LucideIcon } from "lucide-react";
import { icon } from "@/components/icons";

/** Maps a Badge's `icon` field (lib/achievements/badges.ts) to its component. */
export function badgeIcon(name: string): LucideIcon {
  return icon(name);
}
