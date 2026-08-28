import {
  Award, BookCheck, BookOpen, Briefcase, CalendarCheck, CheckCheck, Clock, Flame, Footprints,
  GraduationCap, Grid2x2, Hand, Heart, HeartPulse, House, Landmark, Library, Map, Moon, Palette,
  Plane, Plus, Repeat, ScrollText, ShoppingBag, Sparkles, Sunrise, Target, Trees, TrendingUp,
  Trophy, Users, Utensils, Zap, type LucideIcon,
} from "lucide-react";

/**
 * One place where an icon *name* — stored in framework-free data like
 * lib/achievements/badges.ts, lib/collections/path.ts and
 * lib/gamification/quests.ts — becomes a React component.
 *
 * Those modules deliberately hold no JSX (they are unit-tested without a DOM),
 * so they carry a string. This is the only file that has to know what the
 * string means, and the fallback keeps a typo from crashing a page.
 */
export const ICONS: Record<string, LucideIcon> = {
  Award, BookCheck, BookOpen, Briefcase, CalendarCheck, CheckCheck, Clock, Flame, Footprints,
  GraduationCap, Grid2x2, Hand, Heart, HeartPulse, House, Landmark, Library, Map, Moon, Palette,
  Plane, Plus, Repeat, ScrollText, ShoppingBag, Sparkles, Sunrise, Target, Trees, TrendingUp,
  Trophy, Users, Utensils, Zap,
};

export function icon(name: string): LucideIcon {
  return ICONS[name] ?? Sparkles;
}
