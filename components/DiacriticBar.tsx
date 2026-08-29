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
    /*
      Wrapping, because six 44px targets and a label do not fit across a 390px
      phone once this sits inside a card's padding. Its minimum width was 351px
      against 350px of room, and a grid item's `min-width: auto` handed that one
      pixel straight to the document: the exam paper scrolled sideways by 23px
      and the phone bar ended up over the button that moves to the next part.
      One pixel, two visible faults, and both of them only on a phone.
    */
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className="label-xs mr-1" style={{ color: "var(--ink-3)" }}>Insert</span>
      {DIACRITICS.map((ch) => (
        <button
          key={ch}
          type="button"
          // Keep focus in the field being typed into.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => insert(ch)}
          aria-label={`Insert ${ch}`}
          className="est press h-9 w-9 rounded-full text-base font-semibold transition-ui hover:-translate-y-px"
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          {ch}
        </button>
      ))}
    </div>
  );
}
