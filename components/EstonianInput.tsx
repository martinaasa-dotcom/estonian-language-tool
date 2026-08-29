"use client";

import { useRef, type ChangeEvent, type KeyboardEvent } from "react";

const DIACRITICS = ["õ", "ä", "ö", "ü", "š", "ž"] as const;

/**
 * Estonian text input with a diacritic bar.
 *
 * Typing õäöü on a US keyboard is slow enough that a learner will quietly avoid
 * any feature that needs it, so every Estonian field gets click-to-insert.
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

  const insert = (ch: string) => {
    const el = ref.current;
    if (!el) return onChange(value + ch);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    onChange(value.slice(0, start) + ch + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

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
      <div className="flex gap-1.5" role="group" aria-label="Insert Estonian character">
        {DIACRITICS.map((ch) => (
          <button
            key={ch}
            type="button"
            onClick={() => insert(ch)}
            aria-label={`Insert ${ch}`}
            className="est press h-9 w-9 rounded-full text-base font-semibold transition-ui hover:-translate-y-px"
            style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
}
