"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

const STEPS = [
  { text: "Go to ", link: { href: "https://openrouter.ai", label: "openrouter.ai" }, after: " and sign in with Google. It's free and takes no card." },
  { text: "Click your avatar in the top right, then ", strong: "Keys", after: "." },
  { text: "Click ", strong: "Create Key", after: ". Give it any name. Copy the key it shows you: you only see it once." },
  { text: "In this project's folder, open the file called ", code: ".env", after: " and paste the key between the quotes, like the example below." },
  { text: "Stop the app (Ctrl-C in the terminal) and run ", code: "npm run dev", after: " again. Anu will be waiting." },
];

/*
  The key and nothing else. This used to pin OPENROUTER_MODEL to one free
  model, which reads as helpful and is the opposite: setting it replaces the
  whole free chain with that single name, so the learner who follows this
  guide opts out of the fallback in the act of setting Anu up. Free models are
  rate-limited hard and retired without notice, and both were true of the one
  named here within a day of it being written.
*/
const SNIPPET = 'OPENROUTER_API_KEY="paste-your-key-here"';

export function SetupGuide() {
  const [copied, setCopied] = useState(false);

  return (
    <div>
      <p className="text-sm" style={{ color: "var(--ink-2)" }}>
        Anu needs an API key to answer questions. Everything else (the dictionary, your cards,
        audio) works without one. The key is free and needs no card: Anu asks free models, and
        moves to the next one when the first is busy. Here is the whole process:
      </p>

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
              {s.code && (
                <code className="rounded-md px-1.5 py-0.5 text-xs" style={{ background: "var(--raised)", color: "var(--ink)" }}>
                  {s.code}
                </code>
              )}
              {s.after}
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
              void navigator.clipboard.writeText(SNIPPET);
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
{SNIPPET}
        </pre>
      </div>

      <p className="mt-3 text-xs" style={{ color: "var(--ink-3)" }}>
        That model is free. If Anu ever feels vague about Estonian, a paid model will be noticeably
        sharper, change the second line to <code>anthropic/claude-sonnet-5</code> or{" "}
        <code>openai/gpt-4o</code>, which cost a fraction of a cent per question.
      </p>
    </div>
  );
}
