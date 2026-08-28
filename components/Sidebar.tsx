"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BookOpen, CalendarCheck, GraduationCap, Layers, LogOut, MessageCircleQuestion,
  Settings, Sun,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/", label: "Today", icon: Sun },
  { href: "/review", label: "Review", icon: GraduationCap },
  { href: "/dictionary", label: "Dictionary", icon: BookOpen },
  { href: "/tutor", label: "Anu", icon: MessageCircleQuestion },
  { href: "/words", label: "My words", icon: Layers },
  { href: "/tasks", label: "Tasks", icon: CalendarCheck },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

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

      {/* Mobile bar */}
      <nav
        aria-label="Main"
        className="fixed bottom-0 left-0 right-0 z-40 flex border-t md:hidden"
        style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
      >
        {NAV.map(({ href, label, icon: Icon }) => (
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
      </nav>
    </>
  );
}

function SignOutButton() {
  const router = useRouter();
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
      className="rounded-md p-2"
      style={{ color: "var(--ink-3)" }}
    >
      <LogOut size={16} strokeWidth={1.9} aria-hidden />
    </button>
  );
}

function ThemeToggle() {
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
      className="rounded-md p-2"
      style={{ color: "var(--ink-3)" }}
    >
      <Sun size={16} strokeWidth={1.9} aria-hidden />
    </button>
  );
}
