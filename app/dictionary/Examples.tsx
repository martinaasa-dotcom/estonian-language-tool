"use client";

import { useState, useTransition } from "react";
import { Languages, Loader2, Plus } from "lucide-react";
import { addExample, translateExample } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Chip } from "@/components/ui";
import { Speak } from "@/components/Speak";
import type { Example } from "@/lib/dict/examples";

/**
 * Example sentences on a dictionary entry.
 *
 * These are the most valuable thing on the page after the paradigm: a case
 * table tells you `toas` exists, a sentence tells you when an Estonian would
 * actually say it. Every one of them is attested — recorded by lexicographers
 * and served by Ekilex — which is why the app can build cloze exercises from
 * them without ever writing Estonian of its own.
 *
 * English is fetched one sentence at a time, on request. Ekilex has none on a
 * reader key, and translating eight sentences on every page view would be slow,
 * expensive and mostly unread.
 */
export function Examples({ lexemeId, examples, tutorReady }: {
  lexemeId: string;
  examples: Example[];
  tutorReady: boolean;
}) {
  const [list, setList] = useState(examples);
  const [adding, setAdding] = useState(false);

  if (list.length === 0 && !adding) {
    return (
      <div>
        <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Näited · in a sentence</h3>
        <p className="text-[13.5px]" style={{ color: "var(--ink-3)" }}>
          No example sentences for this word yet — Ekilex has them for most common words, and one
          arrives the first time this entry is fetched. You can also{" "}
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="underline"
            style={{ color: "var(--accent)" }}
          >
            add one from class
          </button>.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="label-xs mb-2 flex items-center gap-2" style={{ color: "var(--ink-3)" }}>
        Näited · in a sentence
        <span className="font-normal normal-case tracking-normal" style={{ letterSpacing: 0 }}>
          {list.length}
        </span>
      </h3>
      <ul className="flex flex-col gap-2">
        {list.map((example) => (
          <ExampleRow
            key={example.et}
            lexemeId={lexemeId}
            example={example}
            tutorReady={tutorReady}
            onTranslated={(en) =>
              setList((l) => l.map((e) => (e.et === example.et ? { ...e, en } : e)))
            }
          />
        ))}
      </ul>

      {adding ? (
        <AddExample
          lexemeId={lexemeId}
          onAdded={(example) => { setList((l) => [...l, example]); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-3 inline-flex items-center gap-1.5 text-[12.5px]"
          style={{ color: "var(--accent)" }}
        >
          <Plus size={13} aria-hidden /> Add a sentence of your own
        </button>
      )}
    </div>
  );
}

function ExampleRow({ lexemeId, example, tutorReady, onTranslated }: {
  lexemeId: string;
  example: Example;
  tutorReady: boolean;
  onTranslated: (en: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const translate = () => {
    setError(null);
    start(async () => {
      const result = await translateExample(lexemeId, example.et);
      if (result.ok) onTranslated(result.en);
      else setError(result.error);
    });
  };

  return (
    <li
      className="rounded-md border px-4 py-3"
      style={{ borderColor: "var(--rule-soft)", background: "var(--raised)" }}
    >
      <div className="flex items-start gap-2">
        <p lang="et" className="est flex-1 text-[15.5px] leading-snug" style={{ color: "var(--ink)" }}>
          {example.et}
        </p>
        <Speak text={example.et} label={`Hear "${example.et}"`} />
      </div>

      {example.en ? (
        <p className="mt-1 flex items-center gap-2 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
          {example.en}
          <Chip tone="again" title="Machine translation — the Estonian above is authoritative, this is not">
            AI
          </Chip>
        </p>
      ) : tutorReady ? (
        <button
          type="button"
          onClick={translate}
          disabled={pending}
          className="mt-1 inline-flex items-center gap-1.5 text-[12.5px] disabled:opacity-50"
          style={{ color: "var(--accent)" }}
        >
          {pending
            ? <><Loader2 size={12} className="animate-spin" aria-hidden /> Translating…</>
            : <><Languages size={12} aria-hidden /> Translate this</>}
        </button>
      ) : null}

      {example.source === "USER" && (
        <span className="mt-1 block text-[11px]" style={{ color: "var(--ink-3)" }}>your own sentence</span>
      )}
      {error && <p role="alert" className="mt-1 text-[12px]" style={{ color: "var(--again)" }}>{error}</p>}
    </li>
  );
}

function AddExample({ lexemeId, onAdded, onCancel }: {
  lexemeId: string;
  onAdded: (example: Example) => void;
  onCancel: () => void;
}) {
  const [et, setEt] = useState("");
  const [en, setEn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setError(null);
    start(async () => {
      const result = await addExample(lexemeId, et, en);
      if (result.ok) onAdded({ et: et.trim(), en: en.trim() || null, source: "USER" });
      else setError(result.error);
    });
  };

  return (
    <div
      className="mt-3 rounded-md border p-4"
      style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
    >
      <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Your sentence</p>
      <EstonianInput
        value={et}
        onChange={setEt}
        placeholder="A sentence from class, using this word"
        ariaLabel="Estonian sentence"
        autoFocus
      />
      <input
        value={en}
        onChange={(e) => setEn(e.target.value)}
        placeholder="English (optional)"
        aria-label="English translation"
        className="mt-2 w-full rounded-md border px-3.5 py-2.5 text-[14px]"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      {error && <p role="alert" className="mt-2 text-[12.5px]" style={{ color: "var(--again)" }}>{error}</p>}
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={save} disabled={pending || et.trim().length < 4}>
          {pending ? "Saving…" : "Save sentence"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
