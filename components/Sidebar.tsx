"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MoreHorizontal, Moon, Sun, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/auth/mode";
import { useDockClearance } from "@/lib/layout/dockClearance";
import { createClient } from "@/lib/supabase/client";
import { BAR, isUnder, PLACES, SECTIONS, type Destination, type NavSection } from "@/lib/ux/nav";
import { Wordmark } from "@/components/brand";
import { icon } from "@/components/icons";

/**
 * The rail, and the phone bar under it.
 *
 * Every destination is on the rail, all the time, under the heading for the
 * question it answers. There is no "More" here and there is nothing behind it.
 *
 * There used to be. Four links were promoted, the other twelve sat behind a
 * disclosure, and it had a bug you only met once you used the app: the group
 * opened itself whenever the current page was inside it, so on Practice or
 * Progress or Grammar the button read "Less" and pressing it did nothing.
 * `showRest` was `railOpen || secondaryActive`, the click flipped `railOpen`,
 * and the second half of that held the rail open regardless.
 *
 * Fixing the toggle was the small half of the fix. Sixteen links behind a
 * button marked "More" are not fewer links, they are the same links somewhere
 * you have to remember; four headings over the same sixteen are four short
 * answers to "where do I go for this", and they cost nothing to read past.
 * `lib/ux/nav.ts` is the one table of what goes where, and the phone sheet and
 * the command palette read it too, so a new screen cannot arrive on two of the
 * three surfaces.
 *
 * Routes that own the whole screen — the landing page, sign-in, first-run
 * setup — live in `app/(chromeless)/` and never render this at all, which is
 * why there is no path list here to keep in sync.
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

  const active = (href: string) => isUnder(href, pathname);
  // The sheet holds everything the four cells of the bar do not.
  const sheet: NavSection[] = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.bar),
  })).filter((section) => section.items.length > 0);
  const restActive = sheet.some((s) => s.items.some((i) => active(i.href)));

  return (
    <>
      {/* Desktop rail */}
      <nav
        aria-label="Main"
        className="scroll-host sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto p-4 md:flex"
      >
        <Link href="/" className="mb-4 block rounded-[var(--r)] px-2 pt-3">
          <Wordmark subtitle="Estonian, daily" />
        </Link>

        {PLACES.map((section) => (
          <section key={section.id} aria-labelledby={`rail-${section.id}`} className="mb-2.5">
            <h2 id={`rail-${section.id}`} className="label-xs px-3 pb-1.5" style={{ color: "var(--ink-3)" }}>
              {section.title}
            </h2>
            {section.items.map((item) => (
              <RailLink key={item.href} item={item} active={active(item.href)} />
            ))}
          </section>
        ))}

        {/*
          Pinned under the sections when they fit and simply last when they do
          not: the rail is a scroll container, because sixteen links plus their
          headings are taller than a short laptop and the answer to that is a
          scrollbar rather than a disclosure.
        */}
        <div className="mt-auto pt-2">
          <p className="px-3 pb-2.5 text-2xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
            <kbd
              className="rounded-md px-1.5 py-0.5 font-semibold"
              style={{ background: "var(--raised)", color: "var(--ink-2)" }}
            >
              ⌘K
            </kbd>{" "}
            goes anywhere.
          </p>
          {SECTIONS.filter((s) => s.id === "app").map((section) =>
            section.items.map((item) => (
              <RailLink key={item.href} item={item} active={active(item.href)} />
            )),
          )}
          <div className="mt-1 flex items-center gap-1 px-1">
            <ThemeToggle labelled />
            <SignOutButton />
          </div>
        </div>
      </nav>

      {/*
        Phone bar: four destinations plus everything else behind one button, so
        no tap target is smaller than a thumb. Floating, so it reads as a
        control rather than the edge of the page.

        This one keeps its "More" and the rail does not, because the constraint
        is different: a rail is a column with a screen of height in it and a bar
        is five cells across a phone. What the button opens is not a heap
        though. It is the same sections the rail shows, with the same headings,
        so the two surfaces answer "where does this live" the same way.

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
        {BAR.map((item) => {
          const Icon = icon(item.icon);
          const on = active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 text-2xs font-semibold transition-colors"
              style={{ color: on ? "var(--ink)" : "var(--ink-3)" }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full"
                style={{
                  background: on ? `var(--${item.tone})` : "transparent",
                  color: on ? "var(--surface)" : "var(--ink-3)",
                }}
              >
                <Icon size={16} strokeWidth={2.2} aria-hidden />
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          className="flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 text-2xs font-semibold"
          style={{ color: restActive ? "var(--ink)" : "var(--ink-3)" }}
        >
          <span
            className="flex h-7 w-7 items-center justify-center rounded-full"
            style={{
              background: restActive ? "var(--accent)" : "transparent",
              color: restActive ? "var(--surface)" : "var(--ink-3)",
            }}
          >
            <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden />
          </span>
          More
        </button>
      </nav>

      {moreOpen && (
        <div
          /*
            Above Anu's floating button, which sits at z-90 and was drawing on
            top of this sheet, and below the command palette at 120.
          */
          className="fixed inset-0 z-[100] flex flex-col justify-end md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Everywhere else"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setMoreOpen(false)}
            className="flex-1"
            style={{ background: "rgb(20 16 32 / 0.4)" }}
          />
          <div
            className="scroll-host max-h-[82vh] overflow-y-auto rounded-t-[var(--r-xl)] p-5"
            style={{
              background: "var(--surface)",
              boxShadow: "var(--shadow-lg)",
              // Over the home indicator otherwise, on every phone that has one.
              paddingBottom: "max(1.75rem, env(safe-area-inset-bottom))",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="label-xs" style={{ color: "var(--ink-3)" }}>Everywhere else</span>
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
            <div className="flex flex-col gap-5">
              {sheet.map((section) => (
                <section key={section.id} aria-labelledby={`sheet-${section.id}`}>
                  <h3 id={`sheet-${section.id}`} className="text-base font-bold" style={{ color: "var(--ink)" }}>
                    {section.title}
                  </h3>
                  <p className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
                    {section.blurb}
                  </p>
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                    {section.items.map((item) => <SheetLink key={item.href} item={item} active={active(item.href)} />)}
                  </div>
                </section>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2">
              <ThemeToggle labelled />
              <SignOutButton labelled />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** One row of the desktop rail. */
function RailLink({ item, active }: { item: Destination; active: boolean }) {
  const Icon = icon(item.icon);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.blurb}
      className="flex items-center gap-3 rounded-full px-3 py-1 text-base transition-ui"
      style={{
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--ink)" : "var(--ink-2)",
        fontWeight: active ? 700 : 500,
        boxShadow: active ? "var(--shadow-sm)" : "none",
      }}
    >
      <span
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors"
        style={{
          background: active ? `var(--${item.tone})` : "var(--raised)",
          color: active ? "var(--surface)" : "var(--ink-3)",
        }}
      >
        <Icon size={15} strokeWidth={2.2} aria-hidden />
      </span>
      {item.label}
    </Link>
  );
}

/**
 * One card in the phone sheet.
 *
 * It carries the blurb where the rail only has room for a title, because the
 * sheet is the surface somebody opens when they are not sure where a thing is,
 * and "Level check" beside "Mock exam" needs a line to tell them apart.
 */
function SheetLink({ item, active }: { item: Destination; active: boolean }) {
  const Icon = icon(item.icon);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className="flex items-start gap-3 rounded-[var(--r)] px-4 py-3"
      style={{
        color: active ? "var(--accent-deep)" : "var(--ink-2)",
        background: active ? "var(--accent-soft)" : "var(--raised)",
      }}
    >
      <span className="mt-0.5" style={{ color: active ? "var(--accent-deep)" : `var(--${item.tone})` }}>
        <Icon size={16} strokeWidth={2.2} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-base font-semibold">{item.label}</span>
        <span className="mt-0.5 block text-xs leading-snug" style={{ color: "var(--ink-3)" }}>
          {item.blurb}
        </span>
      </span>
    </Link>
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
