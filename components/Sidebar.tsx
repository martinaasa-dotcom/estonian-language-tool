"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen, CalendarCheck, ChartNoAxesColumn, GraduationCap, Layers, LogOut, Map,
  MessageCircleQuestion, MoreHorizontal, Settings, Sun, Swords, X,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { supabaseConfigured } from "@/lib/auth/mode";
import { createClient } from "@/lib/supabase/client";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
  /** Shown in the phone bar. The rest live behind "More". */
  primary?: boolean;
}

const NAV: NavItem[] = [
  { href: "/", label: "Today", icon: Sun, primary: true },
  { href: "/learn", label: "Learn", icon: Map, primary: true },
  { href: "/review", label: "Review", icon: GraduationCap, primary: true },
  { href: "/practice", label: "Practice", icon: Swords },
  { href: "/dictionary", label: "Dictionary", icon: BookOpen, primary: true },
  { href: "/tutor", label: "Anu", icon: MessageCircleQuestion },
  { href: "/words", label: "My words", icon: Layers },
  { href: "/progress", label: "Progress", icon: ChartNoAxesColumn },
  { href: "/tasks", label: "Tasks", icon: CalendarCheck },
];

/** Routes that own the whole screen: setting up, or signing in. */
const CHROMELESS = ["/welcome", "/sign-in"];

export function Sidebar() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => setMoreOpen(false), [pathname]);

  if (CHROMELESS.some((p) => pathname.startsWith(p))) return null;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const primary = NAV.filter((n) => n.primary);
  const secondary = NAV.filter((n) => !n.primary);

  return (
    <>
      {/* Desktop rail */}
      <nav
        aria-label="Main"
        className="hidden md:flex w-56 shrink-0 flex-col gap-1 border-r p-4"
        style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
      >
        <Link href="/" className="mb-6 block px-2 pt-2">
          <span lang="et" className="est block text-[22px] font-bold leading-none" style={{ color: "var(--ink)" }}>
            Kodukeel
          </span>
          <span className="label-xs mt-1.5 block" style={{ color: "var(--ink-3)" }}>
            Estonian study
          </span>
        </Link>

        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className="flex items-center gap-3 rounded-md px-3 py-2 text-[14.5px] transition-colors"
            style={{
              background: isActive(href) ? "var(--accent-soft)" : "transparent",
              color: isActive(href) ? "var(--accent)" : "var(--ink-2)",
              fontWeight: isActive(href) ? 600 : 400,
            }}
          >
            <Icon size={17} strokeWidth={1.9} aria-hidden />
            {label}
          </Link>
        ))}

        <p className="mt-4 px-3 text-[11px] leading-relaxed" style={{ color: "var(--ink-3)" }}>
          Press <kbd className="rounded border px-1" style={{ borderColor: "var(--rule)" }}>⌘K</kbd> to jump
          anywhere or look a word up.
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <Link
            href="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            className="flex flex-1 items-center gap-3 rounded-md px-3 py-2 text-[14.5px]"
            style={{ color: isActive("/settings") ? "var(--accent)" : "var(--ink-3)" }}
          >
            <Settings size={17} strokeWidth={1.9} aria-hidden />
            Settings
          </Link>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </nav>

      {/* Phone bar: four destinations plus everything else behind one button, so
          no tap target is smaller than a thumb. */}
      <nav
        aria-label="Main"
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t md:hidden"
        style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
      >
        {primary.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isActive(href) ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px]"
            style={{ color: isActive(href) ? "var(--accent)" : "var(--ink-3)" }}
          >
            <Icon size={19} strokeWidth={1.9} aria-hidden />
            {label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px]"
          style={{ color: secondary.some((n) => isActive(n.href)) ? "var(--accent)" : "var(--ink-3)" }}
        >
          <MoreHorizontal size={19} strokeWidth={1.9} aria-hidden />
          More
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden" role="dialog" aria-label="More">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
            className="flex-1"
            style={{ background: "rgb(0 0 0 / 0.35)" }}
          />
          <div
            className="rounded-t-xl border-t p-4 pb-6"
            style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="label-xs" style={{ color: "var(--ink-3)" }}>More</span>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" style={{ color: "var(--ink-3)" }}>
                <X size={18} aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[...secondary, { href: "/settings", label: "Settings", icon: Settings }].map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 rounded-lg border px-4 py-3 text-[14.5px]"
                  style={{
                    borderColor: "var(--rule)",
                    color: isActive(href) ? "var(--accent)" : "var(--ink-2)",
                    background: isActive(href) ? "var(--accent-soft)" : "var(--surface)",
                  }}
                >
                  <Icon size={17} strokeWidth={1.9} aria-hidden />
                  {label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <ThemeToggle labelled />
              <SignOutButton labelled />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SignOutButton({ labelled }: { labelled?: boolean }) {
  const router = useRouter();
  // Local installs have no accounts to sign out of — see lib/auth/mode.ts.
  if (!supabaseConfigured()) return null;

  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/sign-in");
    router.refresh();
  };
  return (
    <button
      type="button"
      onClick={signOut}
      aria-label="Sign out"
      className={`flex items-center gap-2 rounded-md p-2 ${labelled ? "border px-3 text-[14px]" : ""}`}
      style={{ color: "var(--ink-3)", borderColor: labelled ? "var(--rule)" : undefined }}
    >
      <LogOut size={16} strokeWidth={1.9} aria-hidden />
      {labelled && "Sign out"}
    </button>
  );
}

function ThemeToggle({ labelled }: { labelled?: boolean }) {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme");
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
    }
  }, []);

  const toggle = () => {
    const current = theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("theme", next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark theme"
      className={`flex items-center gap-2 rounded-md p-2 ${labelled ? "border px-3 text-[14px]" : ""}`}
      style={{ color: "var(--ink-3)", borderColor: labelled ? "var(--rule)" : undefined }}
    >
      <Sun size={16} strokeWidth={1.9} aria-hidden />
      {labelled && "Theme"}
    </button>
  );
}
