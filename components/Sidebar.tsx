"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen, CalendarCheck, CalendarRange, ChartNoAxesColumn, Compass, GraduationCap, Languages, Layers,
  LogOut, Map, MessageCircleQuestion, MoreHorizontal, Moon, School, Settings, Sun, Swords, X, Zap,
} from "lucide-react";
import { useCallback, useEffect, useState, type ComponentType } from "react";
import { supabaseConfigured } from "@/lib/auth/mode";
import { useDockClearance } from "@/lib/layout/dockClearance";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/brand";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  /** The dot behind the icon when the item is current. Each destination owns one. */
  tone: string;
  /** Shown in the phone bar. The rest live behind "More". */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: Sun, tone: "var(--butter)", primary: true },
  { href: "/learn", label: "Learn", icon: Map, tone: "var(--mint)", primary: true },
  { href: "/review", label: "Review", icon: GraduationCap, tone: "var(--accent)", primary: true },
  { href: "/practice", label: "Practice", icon: Swords, tone: "var(--peach)" },
  { href: "/dictionary", label: "Dictionary", icon: BookOpen, tone: "var(--sky)", primary: true },
  { href: "/grammar", label: "Grammar", icon: Languages, tone: "var(--butter)" },
  { href: "/tutor", label: "Anu", icon: MessageCircleQuestion, tone: "var(--blush)" },
  { href: "/words", label: "My words", icon: Layers, tone: "var(--mint)" },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn, tone: "var(--accent)" },
  { href: "/assess", label: "Level check", icon: Compass, tone: "var(--blush)" },
  { href: "/tasks", label: "Tasks", icon: CalendarCheck, tone: "var(--peach)" },
  { href: "/week", label: "This week", icon: CalendarRange, tone: "var(--butter)" },
  { href: "/class", label: "Classes", icon: School, tone: "var(--sky)" },
];

/**
 * The rail, and the phone bar under it.
 *
 * Routes that own the whole screen — the landing page, sign-in, first-run setup —
 * live in `app/(chromeless)/` and never render this at all, which is why there is
 * no path list here to keep in sync.
 */
export function Sidebar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const [bar, setBar] = useState<HTMLElement | null>(null);

  // Published on <html> so the offline banner, the install prompt and the
  // toasts can sit clear of this bar rather than each guessing its height.
  useDockClearance(bar);

  useEffect(() => setMoreOpen(false), [pathname]);

  // Escape closes the sheet. A sheet with no way out but a small X in its
  // corner is a sheet somebody taps around the edges of.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const measure = useCallback((node: HTMLElement | null) => setBar(node), []);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const primary = NAV.filter((n) => n.primary);
  const secondary = NAV.filter((n) => !n.primary);
  const secondaryActive = secondary.some((n) => isActive(n.href));

  return (
    <>
      {/* Desktop rail */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 overflow-y-auto p-4 md:flex"
      >
        <Link href="/" className="mb-6 block rounded-[var(--r)] px-2 pt-3">
          <Wordmark subtitle="Estonian, daily" />
        </Link>

        {NAV.map(({ href, label, icon: Icon, tone }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-3 rounded-full px-3 py-2 text-base transition-ui"
              style={{
                background: active ? "var(--surface)" : "transparent",
                color: active ? "var(--ink)" : "var(--ink-2)",
                fontWeight: active ? 700 : 500,
                boxShadow: active ? "var(--shadow-sm)" : "none",
              }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
                style={{
                  background: active ? tone : "var(--raised)",
                  color: active ? "var(--surface)" : "var(--ink-3)",
                }}
              >
                <Icon size={15} strokeWidth={2.2} aria-hidden />
              </span>
              {label}
            </Link>
          );
        })}

        <Link
          href="/review/sprint"
          className="lift mt-3 flex items-center gap-2.5 rounded-full px-3 py-2.5 text-sm font-semibold"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          <Zap size={15} strokeWidth={2.4} aria-hidden /> 60-second sprint
        </Link>

        <p className="mt-4 px-3 text-2xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
          Press{" "}
          <kbd
            className="rounded-md px-1.5 py-0.5 font-semibold"
            style={{ background: "var(--raised)", color: "var(--ink-2)" }}
          >
            ⌘K
          </kbd>{" "}
          to jump anywhere or look a word up,{" "}
          <kbd
            className="rounded-md px-1.5 py-0.5 font-semibold"
            style={{ background: "var(--raised)", color: "var(--ink-2)" }}
          >
            ?
          </kbd>{" "}
          for every shortcut.
        </p>

        <div className="mt-auto flex items-center gap-1 pt-4">
          <Link
            href="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            className="flex flex-1 items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium"
            style={{ color: isActive("/settings") ? "var(--accent-deep)" : "var(--ink-3)" }}
          >
            <Settings size={16} strokeWidth={2} aria-hidden />
            Settings
          </Link>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </nav>

      {/*
        Phone bar: four destinations plus everything else behind one button, so
        no tap target is smaller than a thumb. Floating, so it reads as a
        control rather than the edge of the page.

        NO BACKDROP FILTER ON IT, AND THAT IS THE WHOLE REASON IT IS OPAQUE.
        An element that is `position: fixed`, carries a `backdrop-filter` and
        sits over content that moves has to re-filter its backdrop on every
        frame of every scroll, and the bottom band of the window is exactly
        where new content arrives while somebody is scrolling. Upside Lab
        measured the same pairing on its landing page at 412x915 with the CPU
        throttled ten times: one pass down the page presented 42 frames the
        compositor had to repaint, the worst of them with 38% of the bottom
        eighth of the screen not yet caught up with where the page actually
        was. Hiding that one element took the same scroll to 9 frames, every
        one of them pixel-identical to the settled page.

        So the rule is the pair rather than either half: nothing in this app
        may be fixed over the content and carry a backdrop filter. The bar
        reads the same at a solid fill, since what was behind it was a pastel
        wash rather than anything to be read through.

        The bottom offset is `env(safe-area-inset-bottom)` and not a number:
        installed to a home screen this app runs under the notch and over the
        home indicator (`viewport-fit=cover` in app/layout.tsx asks for that),
        and `bottom-3` put the bar on top of the indicator.
      */}
      <nav
        ref={measure}
        aria-label="Main"
        className="fixed left-3 right-3 z-40 flex justify-around rounded-full border px-1.5 py-1.5 md:hidden"
        style={{
          bottom: "max(0.75rem, env(safe-area-inset-bottom))",
          borderColor: "var(--rule)",
          background: "var(--surface)",
          boxShadow: "var(--shadow)",
        }}
      >
        {primary.map(({ href, label, icon: Icon, tone }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 text-2xs font-semibold transition-colors"
              style={{ color: active ? "var(--ink)" : "var(--ink-3)" }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: active ? tone : "transparent", color: active ? "var(--surface)" : "var(--ink-3)" }}
              >
                <Icon size={16} strokeWidth={2.2} aria-hidden />
              </span>
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className="flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 text-2xs font-semibold"
          style={{ color: secondaryActive ? "var(--ink)" : "var(--ink-3)" }}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              background: secondaryActive ? "var(--accent)" : "transparent",
              color: secondaryActive ? "var(--surface)" : "var(--ink-3)",
            }}
          >
            <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden />
          </span>
          More
        </button>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="More"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
            className="flex-1"
            style={{ background: "rgb(20 16 32 / 0.4)" }}
          />
          <div
            className="rounded-t-[var(--r-xl)] p-5"
            style={{
              background: "var(--surface)",
              boxShadow: "var(--shadow-lg)",
              // Over the home indicator otherwise, on every phone that has one.
              paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="label-xs" style={{ color: "var(--ink-3)" }}>More</span>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="press rounded-full p-1.5"
                style={{ color: "var(--ink-3)", background: "var(--raised)" }}
              >
                <X size={16} aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                ...secondary,
                { href: "/review/sprint", label: "Sprint", icon: Zap, tone: "var(--butter)" },
                { href: "/settings", label: "Settings", icon: Settings, tone: "var(--ink-3)" },
              ].map(({ href, label, icon: Icon, tone }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-[var(--r)] px-4 py-3 text-base font-medium"
                  style={{
                    color: isActive(href) ? "var(--accent-deep)" : "var(--ink-2)",
                    background: isActive(href) ? "var(--accent-soft)" : "var(--raised)",
                  }}
                >
                  <span style={{ color: isActive(href) ? "var(--accent-deep)" : tone }}>
                    <Icon size={16} strokeWidth={2.2} aria-hidden />
                  </span>
                  {label}
                </Link>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <ThemeToggle labelled />
              <SignOutButton labelled />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function IconButton({ onClick, label, labelled, children }: {
  onClick: () => void; label: string; labelled?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`press flex items-center gap-2 rounded-full p-2 transition-colors hover:bg-[var(--raised)] ${
        labelled ? "px-4 text-sm font-medium" : ""
      }`}
      style={{ color: "var(--ink-3)", background: labelled ? "var(--raised)" : undefined }}
    >
      {children}
    </button>
  );
}

function SignOutButton({ labelled }: { labelled?: boolean }) {
  const router = useRouter();
  // Local installs have no accounts to sign out of — see lib/auth/mode.ts.
  if (!supabaseConfigured()) return null;

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/welcome");
    router.refresh();
  };
  return (
    <IconButton onClick={() => void signOut()} label="Sign out" labelled={labelled}>
      <LogOut size={16} strokeWidth={2} aria-hidden />
      {labelled && "Sign out"}
    </IconButton>
  );
}

function ThemeToggle({ labelled }: { labelled?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
      return;
    }
    // Nothing stored: follow the system, but still record which way it went so
    // the button offers the opposite of what is actually on screen.
    setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  const toggle = () => {
    const current = theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("theme", next);
  };

  return (
    <IconButton onClick={toggle} label="Switch between light and dark theme" labelled={labelled}>
      {theme === "dark"
        ? <Sun size={16} strokeWidth={2} aria-hidden />
        : <Moon size={16} strokeWidth={2} aria-hidden />}
      {labelled && "Theme"}
    </IconButton>
  );
}
