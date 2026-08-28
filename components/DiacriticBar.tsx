"use client";

const DIACRITICS = ["õ", "ä", "ö", "ü", "š", "ž"] as const;

/**
 * A shared diacritic bar that types into whichever text field has focus.
 *
 * A form with six Estonian fields would need six bars otherwise, which is clutter;
 * and without any bar the fields quietly go unfilled, because typing õäöü on a US
 * keyboard is slow enough that people skip it.
 */
export function DiacriticBar({ label = "Insert Estonian character" }: { label?: string }) {
  const insert = (ch: string) => {
    const el = document.activeElement;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + ch + el.value.slice(end);

    // React tracks the input's value internally; setting .value directly is
    // ignored on the next render. Going through the native setter makes the
    // change look like real typing, so onChange fires and state stays in sync.
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
    setter?.call(el, next);
    el.dispatchEvent(new Event("input", { bubbles: true }));

    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + ch.length, start + ch.length);
    });
  };

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <span className="label-xs mr-1" style={{ color: "var(--ink-3)" }}>Insert</span>
      {DIACRITICS.map((ch) => (
        <button
          key={ch}
          type="button"
          // Keep focus in the field being typed into.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(ch)}
          aria-label={`Insert ${ch}`}
          className="est h-8 w-8 rounded border text-[15px] transition-opacity hover:opacity-70"
          style={{ borderColor: "var(--rule)", background: "var(--raised)", color: "var(--ink-2)" }}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}
