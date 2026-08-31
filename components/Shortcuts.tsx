"use client";

import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

/** The event the command palette fires to open this without a keyboard. */
export const SHORTCUTS_EVENT = "kodukeel:shortcuts";

interface Group {
  title: string;
  hint: string;
  keys: { press: string[]; does: string }[];
}

/**
 * Every shortcut the app actually has, grouped by where it works.
 *
 * Written down here rather than scattered through the sessions that implement
 * them: a shortcut nobody can discover is a shortcut nobody uses, and the fastest
 * way to make a review session feel slow is to make someone reach for the mouse
 * four times a card. Each line matches a real handler — the review keys live in
 * `ReviewSession`, the sprint keys in `SprintSession`, and so on.
 */
const GROUPS: Group[] = [
  {
    title: "Anywhere",
    hint: "in the app, whatever page you are on",
    keys: [
      { press: ["⌘", "K"], does: "Jump to any screen, or look a word up" },
      { press: ["?"], does: "This list" },
      { press: ["Esc"], does: "Close whatever is open" },
    ],
  },
  {
    title: "Reviewing",
    hint: "the daily loop, and the case drills",
    keys: [
      { press: ["Space"], does: "Show the answer, then grade it Good" },
      { press: ["Enter"], does: "Check what you typed, then grade it" },
      { press: ["1"], does: "Again, no idea" },
      { press: ["2"], does: "Hard, struggled" },
      { press: ["3"], does: "Good, got it" },
      { press: ["4"], does: "Easy, instant" },
      { press: ["U"], does: "Undo the last grade, scheduling and all" },
    ],
  },
  {
    title: "Multiple choice",
    hint: "new cards, and the listening round",
    keys: [
      { press: ["1"], does: "Pick the first option" },
      { press: ["2"], does: "…the second, and so on" },
      { press: ["Space"], does: "Continue once you have answered" },
    ],
  },
  {
    title: "Case Sprint",
    hint: "the 60-second round",
    keys: [
      { press: ["Space"], does: "Flip the card, then count it as right" },
      { press: ["⌫"], does: "Count it as missed and move on" },
    ],
  },
];

/**
 * The shortcut sheet: `?` anywhere, or the command palette.
 *
 * Deliberately not a settings page. Nothing here is configurable, because a
 * remappable shortcut in an app this size is a support burden rather than a
 * feature — this is documentation with a keyboard binding.
 */
export function Shortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); return; }
      // `?` is a real character: while someone is typing an answer it belongs in
      // the answer, not in a dialog over the top of it.
      const typing =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onAsked = () => setOpen(true);

    window.addEventListener("keydown", onKey);
    window.addEventListener(SHORTCUTS_EVENT, onAsked);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(SHORTCUTS_EVENT, onAsked);
    };
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-start justify-center px-4 py-[8vh]"
      style={{ background: "rgb(0 0 0 / 0.35)" }}
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="scroll-host pop-in max-h-full w-full max-w-2xl rounded-[var(--r-xl)] border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="sticky top-0 flex items-center gap-3 border-b px-5 py-3.5"
          style={{ borderColor: "var(--rule-soft)", background: "var(--surface)" }}
        >
          <Keyboard size={17} aria-hidden style={{ color: "var(--accent-deep)" }} />
          <h2 className="text-md font-bold" style={{ color: "var(--ink)" }}>
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="press ml-auto flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
            style={{ color: "var(--ink-3)" }}
          >
            <X size={16} aria-hidden />
          </button>
        </div>

        <div className="grid gap-6 p-5 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="label-xs" style={{ color: "var(--ink-3)" }}>{group.title}</h3>
              <p className="mb-2.5 text-xs" style={{ color: "var(--ink-3)" }}>{group.hint}</p>
              <ul className="flex flex-col gap-1.5">
                {group.keys.map((row) => (
                  <li key={`${group.title}-${row.press.join("+")}-${row.does}`} className="flex items-baseline gap-3">
                    <span className="flex shrink-0 gap-1">
                      {row.press.map((key) => (
                        <kbd
                          key={key}
                          className="rounded-[var(--r-sm)] px-1.5 py-0.5 text-2xs font-semibold"
                          style={{ background: "var(--raised)", color: "var(--ink-2)" }}
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                    <span className="text-xs" style={{ color: "var(--ink-2)" }}>{row.does}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="border-t px-5 py-3 text-xs" style={{ borderColor: "var(--rule-soft)", color: "var(--ink-3)" }}>
          Every control is reachable by tab as well, with a visible focus ring, the shortcuts are a
          shortcut, never the only way in.
        </p>
      </div>
    </div>
  );
}
