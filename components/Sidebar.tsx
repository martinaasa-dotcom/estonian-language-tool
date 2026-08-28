"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen, CalendarCheck, GraduationCap, Layers, LogOut, Moon, MessageCircleQuestion,
  Settings, Sun, Zap,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Wordmark } from "@/components/brand";

const NAV = [
  { href: "/", label: "Today", icon: Sun, tone: "var(--butter)" },
  { href: "/review", label: "Review", icon: GraduationCap, tone: "var(--accent)" },
  { href: "/dictionary", label: "Dictionary", icon: BookOpen, tone: "var(--sky)" },
  { href: "/tutor", label: "Anu", icon: MessageCircleQuestion, tone: "var(--blush)" },
  { href: "/words", label: "My words", icon: Layers, tone: "var(--mint)" },
  { href: "/tasks", label: "Tasks", icon: CalendarCheck, tone: "var(--peach)" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <>
      {/* Desktop rail */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-1 p-4 md:flex"
      >
        <Link href="/" className="mb-7 block rounded-[var(--r)] px-2 pt-3">
          <Wordmark subtitle="Estonian, daily" />
        </Link>

        {NAV.map(({ href, label, icon: Icon, tone }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="group relative flex items-center gap-3 rounded-full px-3 py-2.5 text-[14.5px] transition-all duration-200"
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
          className="lift mt-3 flex items-center gap-2.5 rounded-full px-3 py-2.5 text-[13.5px] font-semibold"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          <Zap size={15} strokeWidth={2.4} aria-hidden /> 60-second sprint
        </Link>

        <div className="mt-auto flex items-center gap-1 pt-4">
          <Link
            href="/settings"
            aria-current={isActive("/settings") ? "page" : undefined}
            className="flex flex-1 items-center gap-2.5 rounded-full px-3 py-2 text-[13.5px] font-medium"
            style={{ color: isActive("/settings") ? "var(--accent)" : "var(--ink-3)" }}
          >
            <Settings size={16} strokeWidth={2} aria-hidden />
            Settings
          </Link>
          <ThemeToggle />
          <SignOutButton />
        </div>
      </nav>

      {/* Mobile bar — floating, so it reads as a control and not a page edge. */}
      <nav
        aria-label="Main"
        className="fixed bottom-3 left-3 right-3 z-40 flex justify-around rounded-full border px-1.5 py-1.5 md:hidden"
        style={{
          borderColor: "var(--rule)",
          background: "color-mix(in oklab, var(--surface) 88%, transparent)",
          backdropFilter: "blur(14px)",
          boxShadow: "var(--shadow)",
        }}
      >
        {NAV.map(({ href, label, icon: Icon, tone }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={label}
              className="flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 text-[9.5px] font-semibold transition-colors"
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
      </nav>
    </>
  );
}

function IconButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="press rounded-full p-2 transition-colors hover:bg-[var(--raised)]"
      style={{ color: "var(--ink-3)" }}
    >
      {children}
    </button>
  );
}

function SignOutButton() {
  const router = useRouter();
  const signOut = async () => {
    await createClient().auth.signOut();
    router.push("/welcome");
    router.refresh();
  };
  return (
    <IconButton onClick={() => void signOut()} label="Sign out">
      <LogOut size={16} strokeWidth={2} aria-hidden />
    </IconButton>
  );
}

function ThemeToggle() {
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
    <IconButton onClick={toggle} label="Switch between light and dark theme">
      {theme === "dark"
        ? <Sun size={16} strokeWidth={2} aria-hidden />
        : <Moon size={16} strokeWidth={2} aria-hidden />}
    </IconButton>
  );
}
