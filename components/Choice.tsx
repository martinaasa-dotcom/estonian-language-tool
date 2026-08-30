"use client";

import {
  createContext, useContext, useEffect, useId, useRef,
  type KeyboardEvent, type ReactNode,
} from "react";
import { Check } from "lucide-react";

/**
 * THE ONE SELECTABLE OPTION, BECAUSE THERE WERE THREE AND NONE OF THEM LOOKED
 * PRESSABLE.
 *
 * Settings, first run and the daily goal all asked the same shape of question —
 * pick one of these, or pick some of these — and each answered it differently.
 * The worst of them, and the one this module was written for, was a bare
 * `<button>` wrapped round a `<Chip>`: the chip is a *label* primitive, so the
 * control had no border, no shadow, no hover and no press. Three things were
 * wrong at once and they compound:
 *
 * 1. **Nothing said it could be clicked.** A chip is what the dictionary uses
 *    to say "B1" and "verb". Eight of them in a row under a heading read as a
 *    legend, so a first-run learner is looking at the one screen that decides
 *    their year and cannot tell that it is a form.
 * 2. **Nothing said which one was chosen.** Selection swapped `--raised` for
 *    `--accent-soft`. On the dark theme those are `#221e36` and `#2a2350`,
 *    which is a hue shift of almost no luminance: the palette's own rule is
 *    that a colour may not be the only thing carrying a distinction, and here
 *    it was carrying the *answer*.
 * 3. **A screen reader was told the wrong thing.** Eight mutually exclusive
 *    options were eight `aria-pressed` toggle buttons, so the group announced
 *    as eight separate switches and cost eight tab stops, rather than as one
 *    radio group saying "3 of 8".
 *
 * So: resting is a surface with a rule and a small shadow, which is exactly how
 * `Button variant="secondary"` says "press me"; hover moves the border to the
 * accent and lifts a pixel; `press` dips on click; and selected inverts to a
 * solid accent fill. The inversion is a *luminance* change rather than a hue
 * change, which is what keeps it legible to somebody who cannot separate the
 * two hues, and the card variant adds a tick on top of it.
 *
 * The semantics come from the group rather than the option, because "one of
 * these" and "any of these" are different controls and only the group knows
 * which it is.
 */

type Select = "one" | "many";

const GroupContext = createContext<Select>("many");

/**
 * A set of options with one question above it.
 *
 * `select="one"` is a real radio group: one tab stop for the whole set, arrow
 * keys move between them, and the reading is "3 of 8" rather than eight
 * unrelated switches. `select="many"` is a set of toggle buttons, which is what
 * `aria-pressed` actually means.
 */
export function ChoiceGroup({
  label, ariaLabel, hint, select = "one", className = "flex flex-wrap gap-2", children, id,
}: {
  /** The question. Rendered as the group's label and read out with it. */
  label?: string;
  /** The name for a group whose heading is drawn by the page around it. */
  ariaLabel?: string;
  hint?: ReactNode;
  select?: Select;
  /** Replaces the default wrapping row: some sets are a grid, some a column. */
  className?: string;
  children: ReactNode;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const auto = useId();
  const labelId = id ?? auto;

  /*
    Roving tabindex, settled from the DOM rather than from props.
    An option knows whether it is the chosen one, but only the group knows
    whether *any* of them is: with nothing chosen every option would render
    tabIndex -1 and the whole set would fall out of the tab order, which is the
    state first run always starts in.
  */
  useEffect(() => {
    if (select !== "one") return;
    const host = ref.current;
    if (!host) return;
    const radios = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    if (radios.length === 0) return;
    const stop =
      radios.find((r) => r.getAttribute("aria-checked") === "true") ??
      radios.find((r) => !r.disabled) ??
      radios[0];
    for (const r of radios) r.tabIndex = r === stop ? 0 : -1;
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (select !== "one") return;
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const host = ref.current;
    if (!host) return;
    const radios = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].filter((r) => !r.disabled);
    if (radios.length === 0) return;
    const here = radios.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next =
      event.key === "Home" ? 0
        : event.key === "End" ? radios.length - 1
          : here < 0 ? 0
            : (here + step + radios.length) % radios.length;
    event.preventDefault();
    // A radio group selects as it moves, which is the behaviour every other
    // radio group on the web has and the reason it needs only one tab stop.
    radios[next]?.focus();
    radios[next]?.click();
  };

  return (
    <div>
      {label && (
        <p id={labelId} className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
          {label}{hint ? <> {hint}</> : null}
        </p>
      )}
      <GroupContext.Provider value={select}>
        <div
          ref={ref}
          role={select === "one" ? "radiogroup" : "group"}
          aria-label={label ? undefined : ariaLabel}
          aria-labelledby={label ? labelId : undefined}
          onKeyDown={onKeyDown}
          className={className}
        >
          {children}
        </div>
      </GroupContext.Provider>
    </div>
  );
}

/** What the group's semantics call this option, and how "chosen" is spelled. */
function optionRole(select: Select, selected: boolean) {
  return select === "one"
    ? { role: "radio" as const, "aria-checked": selected, tabIndex: selected ? 0 : -1 }
    : { "aria-pressed": selected };
}

/*
  Every state lives in `.choice` in app/globals.css. Nothing here sets a
  background, a border colour or a shadow through `style`, because an inline
  style beats a stylesheet and a control that paints its resting look inline
  can never define a hover — which is the fault this component was written to
  clear.
*/
const base =
  "choice inline-flex items-center justify-center gap-2 border font-semibold " +
  "disabled:pointer-events-none";

/**
 * A pill option: a short answer in a row of short answers.
 *
 * Sentence case at the button's own weight, never `.label-xs` — an uppercase
 * tracked micro-label is the app's word for "this is metadata", and wearing it
 * is most of why the goal chips read as a legend instead of a form.
 */
export function ChoiceChip({
  selected, onSelect, disabled, icon, title, even, children,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  title?: string;
  /** Holds a common width, for a row of one- or two-character answers. */
  even?: boolean;
  children: ReactNode;
}) {
  const select = useContext(GroupContext);
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onSelect}
      {...optionRole(select, selected)}
      data-on={selected ? "" : undefined}
      className={`${base} choice-chip rounded-full px-4 py-2.5 text-sm ${even ? "min-w-11" : ""}`}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * A card option: an answer that needs a line of explanation under it.
 *
 * Selected keeps the soft tint rather than inverting, because the second line
 * is `--ink-3` on a light surface and a solid accent fill would swallow it. So
 * the fill is joined by a doubled accent rule (an inset shadow over the border,
 * so nothing reflows) and a tick — three channels, only one of which is hue.
 */
export function ChoiceCard({
  selected, onSelect, disabled, icon, lead, title, titleLang, detail, layout = "row",
}: {
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  /** A short marker before the title, such as the CEFR band. */
  lead?: ReactNode;
  title: ReactNode;
  titleLang?: string;
  detail?: ReactNode;
  /** `stacked` puts the detail under the icon row rather than beside it. */
  layout?: "row" | "stacked";
}) {
  const select = useContext(GroupContext);
  const mark = selected ? "var(--accent-deep)" : "var(--ink-3)";
  const head = (
    <>
      {icon && <span className="shrink-0" style={{ color: mark }}>{icon}</span>}
      {lead && <span className="est tnum shrink-0 text-base font-bold" style={{ color: "var(--accent-deep)" }}>{lead}</span>}
    </>
  );
  // One title element for both layouts. Two of them is how the Estonian unit
  // titles would have quietly lost their `lang` and their serif the first time
  // somebody reached for `stacked`.
  const titleEl = (
    <span lang={titleLang} className={`block text-base font-semibold ${titleLang ? "est" : ""}`} style={{ color: "var(--ink)" }}>
      {title}
    </span>
  );
  const detailEl = detail
    ? <span className="mt-0.5 block text-xs leading-snug" style={{ color: "var(--ink-3)" }}>{detail}</span>
    : null;
  const tick = (
    <Check
      size={16}
      aria-hidden
      className="shrink-0"
      style={{ color: "var(--accent-deep)", opacity: selected ? 1 : 0 }}
    />
  );

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      {...optionRole(select, selected)}
      data-on={selected ? "" : undefined}
      className={`${base} choice-card rounded-[var(--r-lg)] px-4 py-3 text-left ${
        layout === "stacked" ? "flex-col items-stretch gap-1.5" : "gap-3"
      }`}
    >
      {layout === "stacked" ? (
        <>
          <span className="flex w-full items-center gap-2">
            {head}
            <span className="min-w-0 flex-1">{titleEl}</span>
            {tick}
          </span>
          {detailEl}
        </>
      ) : (
        <>
          {head}
          <span className="min-w-0 flex-1">{titleEl}{detailEl}</span>
          {tick}
        </>
      )}
    </button>
  );
}
