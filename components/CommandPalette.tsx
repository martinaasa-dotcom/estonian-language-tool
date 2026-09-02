"use client";

import { fold } from "@/lib/estonian/fold";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { PRACTICE_MODES } from "@/lib/ux/modes";
import { SECTIONS } from "@/lib/ux/nav";
import { SHORTCUTS_EVENT } from "@/components/Shortcuts";

interface Command {
  id: string;
  label: string;
  hint: string;
  /** The heading it appears under. Results are grouped by it. */
  group: string;
  /** Where it goes. Empty for a command that acts instead of navigating. */
  href: string;
  keywords: string;
  /** Run instead of navigating. Used by the one command that opens a dialog. */
  run?: () => void;
}

/*
  Built from the same tables the rail and the practice hub read, rather than
  typed out again here. This list had drifted: it offered six practice modes
  and the hub offers eleven, so Verb government and the Leech clinic were
  reachable from one screen and unfindable from the box that promises to go
  anywhere. It also carried its own wording for every destination, which is how
  a screen ends up called two things.
*/
const PLACE_COMMANDS: Command[] = SECTIONS.flatMap((section) =>
  section.items.map((item) => ({
    id: `place-${item.href}`,
    label: item.label,
    hint: item.blurb,
    group: section.title,
    href: item.href,
    keywords: item.keywords,
  })),
);

const MODE_COMMANDS: Command[] = PRACTICE_MODES.map((mode) => ({
  id: `mode-${mode.href}`,
  label: mode.title,
  hint: mode.subtitle,
  group: "Practice",
  href: mode.href,
  keywords: `${mode.subtitle} ${mode.blurb} practice mode game drill`,
}));

const COMMANDS: Command[] = [
  ...PLACE_COMMANDS,
  ...MODE_COMMANDS,
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    hint: "Everything you can do without the mouse",
    group: "This app",
    href: "",
    keywords: "keys hotkeys bindings help question mark",
    run: () => window.dispatchEvent(new Event(SHORTCUTS_EVENT)),
  },
];

/*
  The whole course, in every unit's own words: about 20KB gzipped, and useful
  only once somebody has actually opened this box and typed something. Loaded
  from `lib/collections/syllabus` on first open rather than imported at the
  top of the file, so it is not in the bundle every signed-in page ships
  whether or not anybody ever presses the key that opens it.
*/
let unitCommands: Command[] | null = null;
function loadUnitCommands(): Promise<Command[]> {
  if (unitCommands) return Promise.resolve(unitCommands);
  return import("@/lib/collections/syllabus").then(({ PATH }) => {
    unitCommands = PATH.map((u) => ({
      id: `unit-${u.id}`,
      label: `${u.title}, ${u.subtitle}`,
      hint: u.cefr,
      group: "Units",
      href: `/learn/${u.id}`,
      keywords: `${u.lemmas.join(" ")} unit ${u.cefr}`,
    }));
    return unitCommands;
  });
}

/**
 * ⌘K / Ctrl-K.
 *
 * Two things, in one box: jump to any screen, or look a word up. The second is
 * the one that matters — the app's centre of gravity is the dictionary, and
 * getting there should never cost a click, a page load and a focus hunt when
 * you are mid-sentence in your homework.
 *
 * Results carry the heading of the section they live in, so the box teaches
 * the same map the rail does rather than answering with a flat list of
 * twenty-eight things that all look alike.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [units, setUnits] = useState<Command[] | null>(unitCommands);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQuery("");
        setActive(0);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Fetched once, the first time the box actually opens, and kept in the
  // module-level cache above so a second open in the same session is free.
  useEffect(() => {
    if (open && !units) loadUnitCommands().then(setUnits);
  }, [open, units]);

  const results = useMemo(() => {
    /*
      FOLDED, BECAUSE THE ONE PLACE IN THIS BOX WITH AN ESTONIAN NAME WAS
      UNREACHABLE FROM IT.

      A plain `includes` over the label meant typing `sonad` found nothing, and
      Sõnad was missing from the box that promises to go anywhere — for exactly
      the learner `lib/ux/letterBar.ts` exists for, who has no õ key and cannot
      type the name. The dictionary has folded a search since it was written;
      this is the same six letters from the same table.

      Folding the haystack as well as the query, since it is the label that
      carries the diacritic. A learner who *can* type õ is unaffected: `sõnad`
      folds to `sonad` on both sides and still matches.
    */
    const q = fold(query.trim());
    if (!q) {
      /*
        Nothing typed: every place, under its heading, in the order the rail
        puts them in. Not a cut of seven off the top of a flat list, which is
        what this used to be, and which meant the box that says it goes
        anywhere opened on a sample. Sixteen rows under five headings scroll,
        and the first keystroke narrows them anyway. The modes and the units
        stay out of it, since those are what searching is for.
      */
      return PLACE_COMMANDS;
    }
    const pool = [...COMMANDS, ...(units ?? [])];
    const matches = pool
      .filter((c) => fold(`${c.label} ${c.keywords}`).includes(q))
      .slice(0, 8);
    // The dictionary can answer for a word nothing here matches, so it is always
    // offered rather than leaving a dead end.
    return [
      ...matches,
      {
        id: "search",
        label: `Look up “${query.trim()}” in the dictionary`,
        hint: "Estonian or English, inflected forms included",
        group: "Look it up",
        href: `/dictionary?q=${encodeURIComponent(query.trim())}`,
        keywords: "",
      },
    ];
  }, [query, units]);

  /*
    Grouped for the eye, flat for the keyboard. The arrow keys walk `results`
    in order and the index into it has to keep meaning the same row, so the
    headings are drawn from a walk over that same array rather than from a
    second pass that regroups it.
  */
  const rows = results.map((command, index) => ({
    command,
    index,
    heading: command.group !== results[index - 1]?.group ? command.group : null,
  }));

  if (!open) return null;

  const go = (command: Command) => {
    setOpen(false);
    if (command.run) { command.run(); return; }
    router.push(command.href);
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center px-4 pt-[12vh]"
      style={{ background: "rgb(0 0 0 / 0.35)" }}
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-[var(--r-xl)] border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Search size={17} aria-hidden style={{ color: "var(--ink-3)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              if (e.key === "Enter") {
                e.preventDefault();
                const target = results[active];
                if (target) go(target);
              }
            }}
            placeholder="Jump to a screen, or type a word to look up…"
            aria-label="Search commands and words"
            className="w-full bg-transparent text-base outline-none"
            style={{ color: "var(--ink)" }}
          />
          <kbd className="rounded-md border px-1.5 py-0.5 text-2xs" style={{ borderColor: "var(--rule)", color: "var(--ink-3)" }}>
            esc
          </kbd>
        </div>
        <ul className="scroll-host max-h-[52vh] py-1">
          {rows.map(({ command: c, index: i, heading }) => (
            <li key={c.id}>
              {heading && (
                <p className="label-xs px-4 pb-1 pt-2.5" style={{ color: "var(--ink-3)" }}>{heading}</p>
              )}
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c)}
                className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left"
                style={{ background: i === active ? "var(--accent-soft)" : "transparent" }}
              >
                <span className="text-base" style={{ color: i === active ? "var(--accent-deep)" : "var(--ink)" }}>
                  {c.label}
                </span>
                <span className="ml-auto truncate text-xs" style={{ color: "var(--ink-3)" }}>{c.hint}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm" style={{ color: "var(--ink-3)" }}>
              Nothing matches that.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
