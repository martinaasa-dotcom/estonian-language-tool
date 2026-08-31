"use client";

import { useRef, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";
import { DiacriticBar } from "@/components/DiacriticBar";

/**
 * Estonian text input with the letter bar under it.
 *
 * The bar is `DiacriticBar` rather than a second copy of one: it used to build
 * its own row from its own list of letters, so the two could disagree about
 * which letters exist, and now do about whether they are drawn at all.
 *
 * `fallbackRef` is this field, which is what preserves the behaviour the copy
 * had. The shared bar types into whatever has focus, and a learner who presses
 * õ before clicking anywhere would otherwise be typing into nothing.
 *
 * `inputRef` is for a caller that has to reach the field itself, which so far
 * is Anu: picking one of her starters writes a half-written question into a box
 * somewhere else on the panel, and a learner who is not put in it has to work
 * out for themselves that anything happened. The bar still needs a field to
 * fall back to, so the caller's ref is used as this component's own rather than
 * kept alongside it: two refs on one input is how they come apart.
 *
 * `compact` is the floating Anu panel, the one place this field sits beside a
 * button inside a 26rem card rather than across a page. At the default size a
 * long placeholder such as "Why is it raamatut and not raamatu?" ran past the
 * edge of that narrow box and was clipped mid-word, so `compact` drops to the
 * dense-UI type step and tighter padding, the same step `Button`'s own default
 * size reads from.
 */
export function EstonianInput({
  value, onChange, placeholder, autoFocus, onEnter, id, ariaLabel, large, compact, inputRef,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  id?: string;
  ariaLabel?: string;
  large?: boolean;
  compact?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={ref}
        id={id}
        aria-label={ariaLabel}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); }
        }}
        className={`w-full rounded-[var(--r-lg)] border outline-none transition-shadow focus:shadow-[var(--shadow)] ${
          large ? "px-5 py-3.5 text-xl" : compact ? "px-4 py-2.5 text-sm" : "px-5 py-3 text-md"
        }`}
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)", boxShadow: "var(--shadow-sm)" }}
      />
      <DiacriticBar standalone={false} fallbackRef={ref} />
    </div>
  );
}
