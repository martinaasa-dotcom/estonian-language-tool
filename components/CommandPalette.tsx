"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { PATH } from "@/lib/collections/path";
import { SHORTCUTS_EVENT } from "@/components/Shortcuts";

interface Command {
  id: string;
  label: string;
  hint: string;
  /** Where it goes. Empty for a command that acts instead of navigating. */
  href: string;
  keywords: string;
  /** Run instead of navigating. Used by the one command that opens a dialog. */
  run?: () => void;
}

const COMMANDS: Command[] = [
  { id: "today", label: "Today", hint: "Your day: due cards, quests, streak", href: "/", keywords: "home dashboard streak quests goal xp" },
  { id: "review", label: "Start reviewing", hint: "Everything due, scheduled by FSRS", href: "/review", keywords: "flashcards srs study due" },
  { id: "learn", label: "Learning path", hint: "Units from A1 to C1", href: "/learn", keywords: "course units path lessons" },
  { id: "practice", label: "Practice", hint: "Sprint, match, sentences, speaking, listening", href: "/practice", keywords: "games modes" },
  { id: "sprint", label: "Case Sprint", hint: "60-second speed round", href: "/review/sprint", keywords: "timed fast game" },
  { id: "match", label: "Match", hint: "Pair words with meanings", href: "/review/match", keywords: "pairs game tiles" },
  { id: "sentences", label: "Sentences", hint: "Rebuild a real sentence word by word", href: "/review/sentences", keywords: "word order build tiles grammar" },
  { id: "speaking", label: "Speaking", hint: "Say it out loud, compare with a native voice", href: "/review/speaking", keywords: "pronounce record microphone shadowing accent" },
  { id: "listening", label: "Listening", hint: "Hear a word, pick the meaning", href: "/review/listening", keywords: "audio ear sound" },
  { id: "dictation", label: "Dictation", hint: "Hear a sentence, write it down", href: "/review/dictation", keywords: "audio typing spelling listening transcribe" },
  { id: "dictionary", label: "Dictionary", hint: "Search any word or inflected form", href: "/dictionary", keywords: "search lookup paradigm cases" },
  { id: "grammar", label: "Grammar", hint: "What each of the fourteen cases is for", href: "/grammar", keywords: "cases reference explanation partitive genitive inessive endings rules" },
  { id: "tutor", label: "Ask Anu", hint: "Grammar questions, explained", href: "/tutor", keywords: "ai chat grammar help" },
  { id: "words", label: "My words", hint: "Your deck, card by card", href: "/words", keywords: "deck cards suspend delete" },
  { id: "progress", label: "Progress", hint: "Heatmap, forecast, weak cases", href: "/progress", keywords: "stats charts history leaderboard" },
  { id: "tasks", label: "Tasks", hint: "Homework and class work", href: "/tasks", keywords: "homework todo class" },
  { id: "class", label: "Classes", hint: "Teach or join a class", href: "/class", keywords: "classroom teacher students join code school homework" },
  { id: "settings", label: "Settings", hint: "Goal, review mode, backup", href: "/settings", keywords: "backup export import goal preferences" },
  {
    id: "shortcuts",
    label: "Keyboard shortcuts",
    hint: "Everything you can do without the mouse",
    href: "",
    keywords: "keys hotkeys bindings help question mark",
    run: () => window.dispatchEvent(new Event(SHORTCUTS_EVENT)),
  },
];

const UNIT_COMMANDS: Command[] = PATH.map((u) => ({
  id: `unit-${u.id}`,
  label: `${u.title}, ${u.subtitle}`,
  hint: `Unit · ${u.cefr}`,
  href: `/learn/${u.id}`,
  keywords: `${u.lemmas.join(" ")} unit ${u.cefr}`,
}));

/**
 * ⌘K / Ctrl-K.
 *
 * Two things, in one box: jump to any screen, or look a word up. The second is
 * the one that matters — the app's centre of gravity is the dictionary, and
 * getting there should never cost a click, a page load and a focus hunt when
 * you are mid-sentence in your homework.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = [...COMMANDS, ...UNIT_COMMANDS];
    const matches = q
      ? pool.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().includes(q)).slice(0, 8)
      : COMMANDS.slice(0, 7);
    if (!q) return matches;
    // The dictionary can answer for a word nothing here matches, so it is always
    // offered rather than leaving a dead end.
    return [
      ...matches,
      {
        id: "search",
        label: `Look up “${query.trim()}” in the dictionary`,
        hint: "Estonian or English, inflected forms included",
        href: `/dictionary?q=${encodeURIComponent(query.trim())}`,
        keywords: "",
      },
    ];
  }, [query]);

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
            className="w-full bg-transparent text-[15px] outline-none"
            style={{ color: "var(--ink)" }}
          />
          <kbd className="rounded border px-1.5 py-0.5 text-[11px]" style={{ borderColor: "var(--rule)", color: "var(--ink-3)" }}>
            esc
          </kbd>
        </div>
        <ul className="scroll-host max-h-[52vh] py-1">
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(c)}
                className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left"
                style={{ background: i === active ? "var(--accent-soft)" : "transparent" }}
              >
                <span className="text-[14.5px]" style={{ color: i === active ? "var(--accent)" : "var(--ink)" }}>
                  {c.label}
                </span>
                <span className="ml-auto truncate text-[12px]" style={{ color: "var(--ink-3)" }}>{c.hint}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-6 text-center text-[13.5px]" style={{ color: "var(--ink-3)" }}>
              Nothing matches that.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
