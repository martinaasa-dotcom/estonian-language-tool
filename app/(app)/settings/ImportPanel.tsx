"use client";

import { useMemo, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { importWords } from "@/app/actions";
import { Button } from "@/components/Button";
import { DiacriticBar } from "@/components/DiacriticBar";
import { Card } from "@/components/ui";

interface Row { lemma: string; translation: string; pos: string }

const EXAMPLE = `tuba - room
raamat - book
lugema - to read`;

/**
 * Format-agnostic importer. Speakly, Quizlet, a spreadsheet column, or a list typed
 * out from a class handout all arrive as the same thing: lines with two halves.
 */
function parse(text: string): Row[] {
  const rows: Row[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    // Tab, then a dash with spaces, then comma, then semicolon.
    const parts =
      line.includes("\t") ? line.split("\t")
      : DASH_SEPARATED.test(line) ? line.split(DASH_SEPARATED)
      : line.includes(";") ? line.split(";")
      : line.includes(",") ? line.split(",")
      : [line];

    const lemma = parts[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
    const translation = parts.slice(1).join(", ").trim().replace(/^["']|["']$/g, "");
    if (!lemma || !translation) continue;

    rows.push({ lemma, translation, pos: lemma.endsWith("ma") ? "VERB" : "OTHER" });
  }
  return rows;
}

/*
  A dash used as a separator in somebody else's word list.

  This reads dashes rather than writing one, which is why it is spelled with
  escapes: the reader-copy guard walks this file, and a literal em dash in it
  would be indistinguishable from copy. A pasted list from Speakly or a class
  handout uses whichever of the three its author typed.
*/
const DASH_SEPARATED = /\s[\u2013\u2014-]\s/;

export function ImportPanel() {
  const [text, setText] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const rows = useMemo(() => parse(text), [text]);

  const submit = () => {
    start(async () => {
      const r = await importWords(rows);
      // Refused for being too fast. Nothing was written, and the text stays in
      // the box: a paste somebody spent a minute assembling must not be
      // cleared by a message telling them to try again.
      if (!r.ok) {
        setResult(r.error);
        return;
      }
      // A paste larger than the limit is handled, not rejected. Silently
      // dropping the tail would leave someone thinking it all went in.
      const overflow = r.truncated
        ? ` Only the first ${r.limit} lines were read; paste the rest separately.`
        : "";
      setResult(
        r.created === 0
          ? `Nothing new. Every word was already in your deck.${overflow}`
          : `Added ${r.created} word${r.created === 1 ? "" : "s"} and ${r.cards} cards.` +
            (r.skipped.length ? ` Skipped ${r.skipped.length} you already had.` : "") +
            overflow,
      );
      setText("");
    });
  };

  return (
    <Card>
      <p className="text-sm" style={{ color: "var(--ink-2)" }}>
        Paste a word list, from Speakly, a spreadsheet, or typed off a class handout. One word per
        line, Estonian first. Tabs, dashes, commas and semicolons all work as separators.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={EXAMPLE}
        aria-label="Paste word list"
        className="est mt-3 w-full rounded-[var(--r-lg)] border px-5 py-4 text-base outline-none"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      {/* This box is usually pasted into, but its own copy says "typed off a
          class handout", and a handout is exactly where the õ comes from. */}
      <div className="mt-2"><DiacriticBar /></div>

      {rows.length > 0 && (
        <div className="mt-3">
          <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            {rows.length} word{rows.length === 1 ? "" : "s"} found · check before adding
          </p>
          <ul className="scroll-host max-h-40 rounded-[var(--r)] border" style={{ borderColor: "var(--rule)" }}>
            {rows.slice(0, 40).map((r, i) => (
              <li
                key={i}
                className="flex justify-between gap-4 px-3 py-1.5 text-sm"
                style={{ borderTop: i ? "1px solid var(--rule-soft)" : undefined }}
              >
                <span lang="et" className="est" style={{ color: "var(--ink)" }}>{r.lemma}</span>
                <span style={{ color: "var(--ink-3)" }}>{r.translation}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={submit} disabled={pending || rows.length === 0}>
          <Upload size={15} aria-hidden />
          {pending ? "Adding…" : `Add ${rows.length || ""} word${rows.length === 1 ? "" : "s"}`}
        </Button>
        {result && <p className="text-sm" style={{ color: "var(--good-ink)" }}>{result}</p>}
      </div>
    </Card>
  );
}
