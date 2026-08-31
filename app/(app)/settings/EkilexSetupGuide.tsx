"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const STEPS = [
  { text: "Go to ", link: { href: "https://ekilex.ee", label: "ekilex.ee" }, after: " and register. It's free and needs no card." },
  { text: "Once signed in, open your ", strong: "profile", after: ", then the ", strong2: "API", after2: " tab." },
  { text: "Request a reader key. Copy it once it is issued." },
  { text: "In this project's folder, open the file called ", code: ".env", after: " and paste the key between the quotes, like the example below." },
  { text: "Stop the app (Ctrl-C in the terminal) and run ", code: "npm run dev", after: " again." },
];

/**
 * What turns on with a key, in the order it actually matters: search first,
 * because it is the thing every other feature is built on top of.
 */
const UNLOCKS = [
  "Search reaches all of Estonian, not just the built-in set, with checked forms, gradation, verb government and CEFR level.",
  "Real example sentences arrive too. Gap-fill cards, dictation and the sentence builder all depend on these, and the built-in set alone has almost none.",
  "The mock exam's reading and listening parts use real sentences instead of falling back to single words.",
  "The grammar reference's oblique-case tables (the inside and outside cases) show a real form instead of a dead end.",
];

export function EkilexSetupGuide() {
  const [copied, setCopied] = useState(false);
  // Empty on purpose, matching .env.example: the value is never rendered
  // whole, since the assignment shape "EKILEX_API_KEY=<8+ chars>" is exactly
  // what CI's credential scan watches for on this key. Ekilex keys carry no
  // prefix the way an OpenRouter or Anthropic key does, so the scan cannot
  // tell a real one from a placeholder by its shape alone.
  const snippet = 'EKILEX_API_KEY=""';

  return (
    <div>
      <p className="text-sm" style={{ color: "var(--ink-2)" }}>
        Search, cards and audio all work with no key. A free reader key from the Institute of the
        Estonian Language unlocks the rest:
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {UNLOCKS.map((u) => (
          <li key={u} className="flex gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
            <span aria-hidden style={{ color: "var(--accent-deep)" }}>·</span>
            <span>{u}</span>
          </li>
        ))}
      </ul>

      <ol className="mt-4 flex flex-col gap-3">
        {STEPS.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm" style={{ color: "var(--ink-2)" }}>
            <span
              className="tnum flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
              style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            >
              {i + 1}
            </span>
            <span>
              {s.text}
              {s.link && (
                <a href={s.link.href} target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--accent-deep)" }}>
                  {s.link.label}
                </a>
              )}
              {s.strong && <strong style={{ color: "var(--ink)" }}>{s.strong}</strong>}
              {s.after}
              {s.strong2 && <strong style={{ color: "var(--ink)" }}>{s.strong2}</strong>}
              {s.after2}
              {s.code && (
                <code className="rounded-md px-1.5 py-0.5 text-xs" style={{ background: "var(--raised)", color: "var(--ink)" }}>
                  {s.code}
                </code>
              )}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 rounded-md border" style={{ borderColor: "var(--rule)" }}>
        <div className="flex items-center justify-between border-b px-3 py-2" style={{ borderColor: "var(--rule-soft)" }}>
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>.env</span>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(snippet);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="flex items-center gap-1.5 text-xs"
            style={{ color: copied ? "var(--good-ink)" : "var(--ink-3)" }}
          >
            {copied ? <><Check size={13} aria-hidden /> Copied</> : <><Copy size={13} aria-hidden /> Copy</>}
          </button>
        </div>
        <pre className="overflow-x-auto px-3 py-3 text-xs leading-relaxed" style={{ color: "var(--ink-2)" }}>
{snippet}
        </pre>
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
        Every word already in the deck gets upgraded to the real forms the next time it is opened.
        Nothing has to be re-added. A word Ekilex had nothing to say about the last time it was
        looked up is remembered as a miss for a day, so it will not retry until then.
      </p>
    </div>
  );
}
