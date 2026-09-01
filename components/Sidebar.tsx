"use client";

import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, MoreHorizontal, Moon, Sun, X } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useState } from "react";
import { supabaseConfigured } from "@/lib/auth/mode";
import { useDockClearance } from "@/lib/layout/dockClearance";
import { useNavMarker } from "@/lib/layout/navMarker";
import { createClient } from "@/lib/supabase/client";
import { useOffline } from "@/components/OfflineProvider";
import { outboxSize } from "@/lib/offline/db";
import { forgetThisDevice } from "@/lib/offline/forget";
import { BAR, isUnder, LISTED, PLACES, SECTIONS, type Destination, type NavSection } from "@/lib/ux/nav";
import { NavMarker } from "@/components/NavMarker";
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
  /*
    One pill per surface, travelling from the place you left to the place you
    asked for. The rail runs down its column and the bar runs across, which is
    the only difference between the two: `lib/layout/navMarker.ts` measures the
    cells and `app/nav.css` says how a pane behaves once it has been placed.
  */
  const railMarker = useNavMarker("rail", "y");
  const barMarker = useNavMarker("bar", "x");

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
  /*
    The sheet holds everything the four cells of the bar do not, minus anything
    with a button of its own. Anu's is on this screen too, so listing her here
    would be the same duplicate the rail just lost.
  */
  const sheet: NavSection[] = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => LISTED.includes(item) && !item.bar),
  })).filter((section) => section.items.length > 0);
  const restActive = sheet.some((s) => s.items.some((i) => active(i.href)));

  return (
    <>
      {/*
        The desktop rail. Two boxes rather than one, and the split is the
        whole point.

        Every destination plus four headings and a rule comes to more than a
        laptop is tall, so this column has always scrolled. The scroll was on
        the nav itself, which meant the wordmark went with it: reach the
        bottom of the list and the app's own name has left the screen, and the
        one fixed thing in the layout is the piece that moved. It stays put
        now. The nav holds the height and no longer scrolls, the wordmark is
        its first child, and the list below it is the scroll container.

        Split rather than `position: sticky` on the wordmark, because a sticky
        header has to hide what passes beneath it and there is nothing here to
        hide it with. This rail is transparent over the fixed pastel wash, so a
        solid fill behind the wordmark would be a flat rectangle sitting on a
        gradient, and the one thing that hides a moving backdrop without a fill
        is a `backdrop-filter`, which this app does not put over moving content
        (see the phone bar below). A second scroll container costs none of
        that: the rows are simply clipped at its top edge, which is what every
        other scroller in the app already does.
      */}
      <nav
        aria-label="Main"
        className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col p-4 md:flex"
      >
        {/*
          A link to Today, which nothing about it used to say. See `.brand-tap`
          in app/globals.css for the tint and the growth, and `title` for where
          it goes, which is what every row of this rail carries too.

          Outside the well below, deliberately. It is not a nav cell, so the
          pointer's pane has no business following on to it, and it is the one
          row in this column that does not scroll.
        */}
        <Link
          href="/"
          title="Today"
          className="brand-tap tap-tint mb-5 mr-1 block shrink-0 cursor-pointer rounded-[var(--r)] px-2 py-2.5"
        >
          <span className="brand-mark">
            <Wordmark subtitle="Estonian, daily" />
          </span>
        </Link>

        {/*
          The list, and the well the marker is measured against.

          `min-h-0` is what makes this scroll at all: a flex item's automatic
          minimum is its content, so without it the list sets the height of a
          column that is already fixed to the screen and nothing overflows
          anywhere. `-mr-4` gives the scrollbar back the nav's own right
          padding, so the thumb sits at the edge of the rail rather than
          floating a centimetre inside it; `.scroll-host` then puts the rows
          back a comfortable distance from it.

          THE WELL AND THE SCROLL CONTAINER HAVE TO BE THE SAME BOX. The panes
          are placed by `offsetTop` and drawn absolutely, so they travel with
          the rows only while the rows' offset parent is the thing that
          scrolls; hang them off the nav instead and the pill stays where the
          window is while the row it names slides out from under it. That was
          free when the nav was itself the scroller. It is not free now, so
          this box takes it on: `relative` to be the offset parent the cells
          measure from, and `isolate` for the stacking context that keeps a
          `z-index: -1` pane behind the rows rather than behind the page. The
          nav's own `sticky` used to be quietly supplying both.
        */}
        <div
          ref={railMarker.ref}
          data-nav-marked={railMarker.mark ? "" : undefined}
          className="scroll-host relative isolate -mr-4 flex min-h-0 flex-1 flex-col"
          style={
            {
              "--nav-marker-bg": "var(--surface)",
              "--nav-marker-shadow": "var(--shadow-sm)",
            } as CSSProperties
          }
        >
          {/*
            The panes come before the rows, since a row draws over whichever
            pane it is standing on. Both are placed entirely by measurement, so
            the pill is exactly the row it is under. The marker is the card the
            current row used to paint for itself, and one of them travelling is
            the whole difference between this and a light going out over here
            as another comes on over there.
          */}
          <NavMarker state={railMarker} />
          {/*
            The gap between sections is doing the work the headings only label.
            Four groups two rows apart read as one list with words in it; four
            groups with air around them read as four, which is the whole point of
            grouping them. It is the largest space in the column on purpose.
          */}
          {PLACES.map((section) => (
            <section key={section.id} aria-labelledby={`rail-${section.id}`} className="mb-7">
              <h2 id={`rail-${section.id}`} className="label-xs px-3 pb-2.5" style={{ color: "var(--ink-3)" }}>
                {section.title}
              </h2>
              {section.items.map((item) => (
                <RailLink key={item.href} item={item} active={active(item.href)} />
              ))}
            </section>
          ))}

          {/*
            Settings, your reports, and what this thing is. Pinned under the
            sections when they fit and simply last when they do not, since the
            rail is a scroll container: fourteen rows with air between their
            groups are taller than a short laptop, and the answer to that is a
            scrollbar rather than a disclosure.

            A rule rather than another heading. This is the quiet end of the
            column and three more uppercase words at the bottom of it would be
            one label too many.
          */}
          <div className="mt-auto border-t pt-4" style={{ borderColor: "var(--rule-soft)" }}>
            {SECTIONS.filter((s) => s.id === "app").map((section) =>
              section.items.map((item) => (
                <RailLink key={item.href} item={item} active={active(item.href)} />
              )),
            )}
            <div className="mt-2 flex items-center gap-1 px-1">
              <ThemeToggle labelled />
              <SignOutButton />
            </div>
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
        className="fixed left-3 right-3 z-40 md:hidden"
        style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        {/*
          THE CAPSULE IS INSIDE THE NAV RATHER THAN BEING IT, AND THAT IS WHAT
          KEEPS THE BREATH FROM LYING TO THE MEASUREMENT. `useDockClearance`
          reads a bounding rectangle, which a transform changes: the bar
          swelling three percent while the window happened to be resizing
          would publish a clearance three percent too tall to everything that
          sits clear of it. The nav lays out and is measured, the capsule
          inside it is what scales, and the two are the same size whenever
          anybody asks.

          `isolate` is load-bearing too. The panes sit at a negative z-index
          so the cells can stay unpositioned and keep reporting their offsets
          against this element; with no stacking context here they would fall
          behind the capsule's own fill and never be seen again.
        */}
        <div
          ref={barMarker.ref}
          data-nav-marked={barMarker.mark ? "" : undefined}
          className="relative isolate flex justify-around rounded-full border px-1.5 py-1.5"
          style={
            {
              borderColor: "var(--rule)",
              background: "var(--surface)",
              boxShadow: "var(--shadow)",
              "--nav-marker-bg": "var(--raised)",
            } as CSSProperties
          }
        >
          <NavMarker state={barMarker} />
          {BAR.map((item) => {
            const Icon = icon(item.icon);
            const on = active(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-nav-cell
                data-nav-goes
                data-nav-on={on ? "" : undefined}
                aria-current={on ? "page" : undefined}
                className="nav-cell flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 text-2xs font-semibold"
                style={{ color: on ? "var(--ink)" : "var(--ink-3)" }}
              >
                <span
                  className="nav-glyph flex h-7 w-7 items-center justify-center rounded-full"
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
          {/*
            A cell the marker may stand on and never travels to on a press,
            because it opens a sheet rather than a page and there is nothing
            for a bet to be right about. `data-nav-goes` is what says a cell
            goes somewhere, and this one deliberately does not carry it.
          */}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            data-nav-cell
            data-nav-on={restActive ? "" : undefined}
            className="nav-cell flex flex-1 flex-col items-center gap-1 rounded-full py-1.5 text-2xs font-semibold"
            style={{ color: restActive ? "var(--ink)" : "var(--ink-3)" }}
          >
            <span
              className="nav-glyph flex h-7 w-7 items-center justify-center rounded-full"
              style={{
                background: restActive ? "var(--accent)" : "transparent",
                color: restActive ? "var(--surface)" : "var(--ink-3)",
              }}
            >
              <MoreHorizontal size={16} strokeWidth={2.2} aria-hidden />
            </span>
            More
          </button>
        </div>
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

/**
 * One row of the desktop rail.
 *
 * It paints no background of its own in either state now. The card the
 * current row used to draw for itself is one pane that the marker places, and
 * a row that also painted itself would be a second answer to the same
 * question arriving a beat later. What is left here is what a pane cannot
 * say: which row is bold, and which glyph wears its own colour. Those two are
 * also the whole of what tells the row you are on from the row you are
 * pointing at, since both now carry the same pane; see `app/nav.css`.
 *
 * The ink reads `--nav-ink` rather than naming its resting colour, because an
 * inline style beats a class hover, silently, which is the mechanism that
 * left half the controls in this app dead under a pointer. A custom property
 * is how a caller passes a tone *through* one, and `app/nav.css` spends it
 * when the pointer's pane arrives underneath.
 */
function RailLink({ item, active }: { item: Destination; active: boolean }) {
  const Icon = icon(item.icon);
  return (
    <Link
      href={item.href}
      data-nav-cell
      data-nav-goes
      data-nav-on={active ? "" : undefined}
      aria-current={active ? "page" : undefined}
      title={item.blurb}
      className="nav-cell flex items-center gap-3 rounded-full px-3 py-1.5 text-base"
      style={{
        color: active ? "var(--ink)" : "var(--nav-ink, var(--ink-2))",
        fontWeight: active ? 700 : 500,
      }}
    >
      <span
        className="nav-glyph flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors"
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

/**
 * Signing out leaves the device the way a stranger should find it.
 *
 * The outbox gets one last chance to reach the server, then the pages the
 * worker cached, the stashed session and any unfinished exam paper are
 * removed (`lib/offline/forget.ts`), and only then does the cookie go. A grade
 * that still could not land is the one thing this cannot keep and cannot
 * quietly drop, so it asks: the person pressing this on a train may prefer to
 * stay signed in until the tunnel ends.
 */
function SignOutButton({ labelled }: { labelled?: boolean }) {
  const router = useRouter();
  const { flush } = useOffline();
  // Local installs have no accounts to sign out of — see lib/auth/mode.ts.
  if (!supabaseConfigured()) return null;

  const signOut = async () => {
    await flush();
    const stranded = await outboxSize();
    if (stranded > 0) {
      const grades = stranded === 1 ? "1 grade" : `${stranded} grades`;
      const ok = window.confirm(
        `${grades} from this device have not reached your account yet. Signing out now loses them. Sign out anyway?`,
      );
      if (!ok) return;
    }
    await forgetThisDevice();
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
