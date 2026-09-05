"use client";

import { createContext, useContext, useTransition, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { setLetterBar } from "@/app/actions";
import { ESTONIAN_LETTERS, type LetterBar } from "@/lib/ux/letterBar";

/**
 * THE BAR THAT TYPES THE SIX LETTERS A UK OR US KEYBOARD DOES NOT HAVE.
 *
 * One implementation, used by the free-standing bar that serves a whole form
 * and by the row `EstonianInput` draws under its own field. It was two, with a
 * `DIACRITICS` constant each and two different ways of getting a character into
 * a field, which is two places for a seventh letter to be forgotten.
 *
 * Whether it is drawn at all is decided in CSS, from `.letter-bar` and the
 * `[data-letters]` a `LetterBarScope` publishes. See lib/ux/letterBar.ts for
 * the argument and app/globals.css for the rule.
 */

/** Whether the bar in this part of the tree may offer to remove itself. */
const Dismissible = createContext(false);

/**
 * Publishes one learner's answer for everything drawn inside it.
 *
 * `display: contents` because this wraps an app shell that is already a flex
 * row: the div has to carry an attribute without generating a box, or the rail
 * and the main column stop being siblings.
 *
 * The attribute is rendered on the server, from the setting, so it is in the
 * first paint. A client effect writing it after hydration would show the bar
 * for a frame to every learner who asked for it to be gone, on every single
 * navigation, which is a worse bug than the one this feature fixes.
 */
export function LetterBarScope({
  value, dismissible = false, children,
}: {
  value: LetterBar;
  /**
   * Off unless a scope says otherwise. First run has its own control for this
   * on the first screen, and a second one inside the level check would write an
   * answer that the end of the wizard then overwrites.
   */
  dismissible?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dismissible.Provider value={dismissible}>
      <div className="contents" data-letters={value}>{children}</div>
    </Dismissible.Provider>
  );
}

/**
 * Types `ch` into whatever has focus.
 *
 * React tracks an input's value internally, so setting `.value` is ignored on
 * the next render. Going through the native setter makes the change look like
 * real typing, so `onChange` fires and controlled state stays in sync.
 */
function insert(ch: string, fallback?: HTMLInputElement | HTMLTextAreaElement | null) {
  const active = document.activeElement;
  const el = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
    ? active
    : fallback;
  if (!el) return;

  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + ch + el.value.slice(end);

  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
  setter?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));

  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(start + ch.length, start + ch.length);
  });
}

export function DiacriticBar({
  label = "Insert Estonian character",
  standalone = true,
  fallbackRef,
}: {
  label?: string;
  /**
   * A bar serving a whole form says what it is for. The row under a single
   * field does not: it is directly beneath the box it types into.
   */
  standalone?: boolean;
  /** The field to type into when nothing has focus. */
  fallbackRef?: RefObject<HTMLInputElement | null>;
}) {
  const dismissible = useContext(Dismissible);
  const router = useRouter();
  const [pending, start] = useTransition();

  const hide = (from: HTMLElement) => {
    // Optimistic, on the scope this bar is actually inside, so the row goes the
    // moment it is pressed rather than a round trip later. The refresh below
    // re-renders the same attribute from the setting, so the two agree.
    (from.closest("[data-letters]") ?? document.documentElement)
      .setAttribute("data-letters", "off");
    start(async () => {
      await setLetterBar("off");
      router.refresh();
    });
  };

  /*
    A KEY THAT BEHAVES LIKE THE LETTERS ON THE LANDING PAGE.

    These six are the only place in the app where one of those letters is a
    control rather than an ornament, and they were the flattest thing on the
    screen: a one pixel lift, which is the hover a row in a list gets. `.press`
    still supplies the push, and `.letter-key` supplies the growing and the one
    shake on the way in, so a key is one control with one set of states rather
    than two rules arguing over `transform`. See app/globals.css.
  */
  const letter = (ch: string) => (
    <button
      key={ch}
      type="button"
      // Keep focus in the field being typed into.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => insert(ch, fallbackRef?.current)}
      aria-label={`Insert ${ch}`}
      className="press letter-key h-9 w-9 shrink-0 rounded-full text-base font-semibold"
      style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
    >
      {ch}
    </button>
  );

  /*
    The way out travels with the last letter, welded to it.

    The moment somebody notices they do not need this row is the moment they
    are looking at it, so the way out is here rather than three screens away in
    Settings. But it is a control *on* the row, not a seventh letter, and as a
    wrap item of its own it could be pushed onto a line by itself: under Anu's
    box the six letters fitted and the cross did not, so it sat alone under the
    row, left-aligned, reading as something that had come loose rather than as
    a way to dismiss anything. So the pair is one flex item. Whatever the width,
    the cross is beside a letter or it is not drawn, and the hairline is the
    same divider `SpeakPair` uses to say two halves are one control.
  */
  const last = ESTONIAN_LETTERS[ESTONIAN_LETTERS.length - 1]!;
  const rest = ESTONIAN_LETTERS.slice(0, -1);

  return (
    /*
      Wrapping. This bar is desktop-only now, so it is no longer one pixel of
      overflow away from pushing an exam paper sideways on a 390px phone, which
      is what it used to be. It still wraps, because the exam's answer column at
      768px is narrow enough to want it and wrapping costs nothing.
    */
    <div className="letter-bar flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      {standalone && (
        <span className="label-xs mr-1" style={{ color: "var(--ink-3)" }}>Insert</span>
      )}
      {rest.map(letter)}
      {dismissible ? (
        <span className="flex shrink-0 items-center gap-1.5">
          {letter(last)}
          <span aria-hidden className="h-4 w-px shrink-0" style={{ background: "var(--rule)" }} />
          <button
            type="button"
            disabled={pending}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => hide(e.currentTarget)}
            title="Hide these. Settings turns them back on."
            aria-label="Hide the Estonian letters. Settings turns them back on."
            className="press tap-tint flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ color: "var(--ink-3)" }}
          >
            <X size={15} aria-hidden />
          </button>
        </span>
      ) : letter(last)}
    </div>
  );
}

/**
 * The six letters, drawn as a sample rather than named.
 *
 * "The diacritic bar" means nothing to somebody who has met it once under a
 * text box, so the question that offers it shows it. Solid and accented when
 * the row would be drawn, dashed and quieter when it would not: the difference
 * is a border style as well as a tone, because the design system does not let
 * a color carry a distinction on its own.
 *
 * Quieter is a different ink and not a fade. It used to be `--ink-3` at 55%,
 * which is the tone doing the border's job over again at the price of the one
 * thing an opacity always costs, and one letter per chip is short enough that
 * axe declines to rule on it (see scripts/a11y-check.mjs). 2.39:1.
 *
 * On a surface rather than an accent tint, since a chosen `ChoiceCard` is
 * itself `--accent-soft` and a tinted chip on it would disappear at exactly
 * the moment it is the answer.
 */
export function LetterSample({ lit }: { lit: boolean }) {
  return (
    <span className="mt-1 flex flex-wrap gap-1" aria-hidden>
      {ESTONIAN_LETTERS.map((ch) => (
        <span
          key={ch}
          className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold"
          style={
            lit
              ? { background: "var(--surface)", border: "1px solid var(--accent)", color: "var(--accent-deep)" }
              /*
                No `opacity` here, and the doc comment above is the reason it
                was never needed: the distinction is already carried by the
                border style, so the fade was buying nothing and costing the
                only thing it could cost. `--ink-3` is picked to clear 4.5:1 on
                every surface in the system; at 55% these chips measured 2.39
                on the light theme and 2.72 on the dark, and being one letter
                each they were invisible to the sweep as well as on the screen.
              */
              : { border: "1px dashed var(--rule)", color: "var(--ink-3)" }
          }
        >
          {ch}
        </span>
      ))}
    </span>
  );
}
