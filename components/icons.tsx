import {
  Award, BookCheck, BookmarkCheck, BookOpen, BrainCircuit, Briefcase, CalendarCheck, CalendarDays, CalendarRange, Camera,
  ChartNoAxesColumn, CheckCheck, CircleHelp, ClipboardCheck,
  CircleDot, Clock, Compass, Ear, Eye, Flame, Footprints, GraduationCap, Grid2x2, Grid3x3, Hand, Headphones, Heart, HeartPulse,
  Hourglass, House, Landmark, Languages, Layers, Library, Link, Map, MessageCircleQuestion,
  MessageSquareWarning, MessagesSquare, Mic, Moon, Mountain, Palette, PenLine, Plane, Plus, Puzzle, Repeat, Scale, School, ScissorsLineDashed,
  ScrollText, Settings, ShoppingBag, SlidersHorizontal, Sparkles, Stamp, Stethoscope, Sun,
  Sunrise, Swords, Target, Trees, TrendingUp, TriangleAlert, Trophy, Users, Utensils, WifiOff, Zap, type LucideIcon,
} from "lucide-react";

/**
 * One place where an icon *name* — stored in framework-free data like
 * lib/achievements/badges.ts, lib/collections/syllabus/,
 * lib/gamification/quests.ts and lib/ux/nav.ts — becomes a React component.
 *
 * Those modules deliberately hold no JSX (they are unit-tested without a DOM),
 * so they carry a string. This is the only file that has to know what the
 * string means, and the fallback keeps a typo from crashing a page.
 */
export const ICONS: Record<string, LucideIcon> = {
  Award, BookCheck, BookmarkCheck, BookOpen, BrainCircuit, Briefcase, CalendarCheck, CalendarDays, CalendarRange, Camera,
  ChartNoAxesColumn, CheckCheck, CircleHelp, ClipboardCheck,
  CircleDot, Clock, Compass, Ear, Eye, Flame, Footprints, GraduationCap, Grid2x2, Grid3x3, Hand, Headphones, Heart, HeartPulse,
  Hourglass, House, Landmark, Languages, Layers, Library, Link, Map, MessageCircleQuestion,
  MessageSquareWarning, MessagesSquare, Mic, Moon, Mountain, Palette, PenLine, Plane, Plus, Puzzle, Repeat, Scale, School, ScissorsLineDashed,
  ScrollText, Settings, ShoppingBag, SlidersHorizontal, Sparkles, Stamp, Stethoscope, Sun,
  Sunrise, Swords, Target, Trees, TrendingUp, TriangleAlert, Trophy, Users, Utensils, WifiOff, Zap,
};

export function icon(name: string): LucideIcon {
  return ICONS[name] ?? Sparkles;
}
