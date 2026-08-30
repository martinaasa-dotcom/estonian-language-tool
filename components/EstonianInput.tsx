"use client";

import { useRef, type ChangeEvent, type KeyboardEvent } from "react";
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
 */
export function EstonianInput({
  value, onChange, placeholder, autoFocus, onEnter, id, ariaLabel, large,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  onEnter?: () => void;
  id?: string;
  ariaLabel?: string;
  large?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);

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
        className={`est w-full rounded-[var(--r-lg)] border px-5 outline-none transition-shadow focus:shadow-[var(--shadow)] ${large ? "py-3.5 text-xl" : "py-3 text-md"}`}
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)", boxShadow: "var(--shadow-sm)" }}
      />
      <DiacriticBar standalone={false} fallbackRef={ref} />
    </div>
  );
}
