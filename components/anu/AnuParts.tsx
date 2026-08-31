"use client";

import { useTransition, useState } from "react";
import { CheckCheck, Plus } from "lucide-react";
import { createLexeme, addToDeck } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Card, Chip } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { SuggestFix } from "@/components/SuggestFix";
import type { Msg } from "./useAnuChat";

/**
 * The pieces of an Anu conversation shared by the full `/tutor` page and the
 * floating Anu button, so a bubble, a vocabulary suggestion or the provenance
 * line reads and behaves identically wherever the conversation is shown.
 */

export const CHIPS = [
  { label: "Break this sentence down", prompt: "Break this Estonian sentence down morpheme by morpheme, labelling each case: " },
  { label: "Which case, and why?", prompt: "Which case should I use here, and what is the rule? " },
  { label: "Object case check", prompt: "Is the object case right in this sentence, total or partial? Explain the aspect: " },
  { label: "Explain this gradation", prompt: "Explain the consonant gradation in this word and name the pattern: " },
  { label: "Correct my Estonian", prompt: "Correct my Estonian and explain each change: " },
  { label: "Quiz me", prompt: "Quiz me with five short B1-level Estonian questions, one at a time." },
] as const;

/**
 * The instruction behind "Check a sentence".
 *
 * Written out rather than left to the learner to phrase, because the phrasing
 * is what makes the answer useful: name the rule before the fix, and admit
 * uncertainty instead of inventing a form. The corrected sentence is asked for
 * on its own `FIX:` line so the UI can mark it as the model's work rather than
 * letting it pass for dictionary data — Anu's Estonian is never stored as a
 * form (ADR-005); the dictionary's is.
 */
export function sentenceCheckPrompt(estonian: string, meaning: string): string {
  return [
    "Check this sentence for me.",
    "",
    `Estonian: "${estonian.trim()}"`,
    meaning.trim() ? `What I meant: "${meaning.trim()}"` : "",
    "",
    "Please:",
    "1. Say plainly whether it is correct.",
    "2. For each mistake, name the rule first, which case and why, the gradation pattern, the verb's government, or the word order, and only then the fix.",
    "3. Put the corrected sentence on its own final line, starting with FIX:",
    "4. If you are not certain of a form, say so and tell me which word to look up in the dictionary rather than guessing.",
  ].filter(Boolean).join("\n");
}

/**
 * Where the answer came from.
 *
 * The repo already renders provenance on every form the dictionary shows,
 * because a learner has to be able to tell a lexicographer's Estonian from a
 * model's. This is the same question asked of the chat, and the honest answer
 * has two states rather than one. Before a reply, all this can say is which
 * provider the deployment would ask. After one, it names the model that
 * actually wrote what is on screen, read off the reply's own headers, which
 * with a fallback chain configured is not always the same thing.
 */
export function Provenance({ label, answered }: { label: string | null; answered: boolean }) {
  if (!label) return null;
  return (
    <p className="text-2xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
      {answered ? "Answered by" : "Will ask"} {label}. Anu explains grammar; every inflected form in
      the dictionary is stored data from Ekilex, never written by a model.
    </p>
  );
}

/**
 * The way out when Anu could not answer.
 *
 * Both surfaces show the failure inside the conversation, because that is
 * where the learner is looking. Neither may put a control there: a message is
 * sent back to the model as context next time, and a button inside one is a
 * button inside a transcript. So the offer to tell somebody sits under the
 * thread, and only once something has actually failed.
 */
export function AnuFailure({ failure }: { failure: string | null }) {
  if (!failure) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm" style={{ color: "var(--ink-3)" }}>Keeps happening?</p>
      <SuggestFix
        category="BROKEN"
        trigger={`Asking Anu failed: ${failure}`}
        label="Tell the Kodukeel team"
      />
    </div>
  );
}

/**
 * What a "check this sentence" message should look like once sent.
 *
 * The prompt carries four numbered instructions so the answer is worth reading;
 * the learner typed one sentence. Showing them the scaffolding back makes the
 * conversation unreadable, so the bubble shows what they actually wrote. The
 * full text is still what was sent, and still what is stored.
 */
function displayUserContent(content: string): string {
  if (!content.startsWith("Check this sentence for me.")) return content;
  const estonian = /^Estonian: "(.*)"$/m.exec(content)?.[1];
  const meaning = /^What I meant: "(.*)"$/m.exec(content)?.[1];
  if (!estonian) return content;
  return meaning ? `${estonian}\n\n(${meaning})` : estonian;
}

export function Bubble({ message, streaming }: { message: Msg; streaming: boolean }) {
  const isUser = message.role === "user";
  const { body: withoutVocab, vocab } = splitVocab(message.content);
  const { body, unverified } = splitUnverified(withoutVocab);
  const { rest, fix } = splitFix(isUser ? displayUserContent(body) : body);

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && <Mascot size={34} className="mt-1 shrink-0" blink={false} />}
      <div
        className="rounded-[var(--r-lg)] border px-4 py-3.5"
        style={{
          borderColor: isUser ? "transparent" : "var(--rule)",
          background: isUser ? "var(--accent-soft)" : "var(--surface)",
          boxShadow: isUser ? "none" : "var(--shadow-sm)",
          borderBottomRightRadius: isUser ? 8 : undefined,
          borderBottomLeftRadius: isUser ? undefined : 8,
          maxWidth: isUser ? "85%" : "100%",
        }}
      >
        <p className="label-xs mb-1.5" style={{ color: isUser ? "var(--accent-deep)" : "var(--blush-ink)" }}>
          {isUser
            ? message.content.startsWith("Check this sentence for me.") ? "You · sentence to check" : "You"
            : "Anu"}
        </p>
        <div className="whitespace-pre-wrap text-base leading-relaxed" style={{ color: "var(--ink)" }}>
          {rest}
          {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
        </div>
        {fix && (
          <div className="mt-3 rounded-[var(--r)] px-4 py-3" style={{ background: "var(--accent-soft)" }}>
            <div className="mb-1 flex items-center gap-2">
              <span className="label-xs" style={{ color: "var(--accent-deep)" }}>Corrected</span>
              <Chip tone="again" title="Anu wrote this. The dictionary's forms are stored data; this is not.">
                AI · verify
              </Chip>
            </div>
            <p lang="et" className="text-md" style={{ color: "var(--ink)" }}>{fix}</p>
          </div>
        )}
        {unverified.length > 0 && <UnverifiedNotice words={unverified} />}
        {vocab.length > 0 && <VocabBridge vocab={vocab} />}
      </div>
    </div>
  );
}

/** Pulls the trailing VOCAB: lines out of the reply so they can become cards. */
function splitVocab(content: string): { body: string; vocab: { et: string; en: string }[] } {
  const lines = content.split("\n");
  const vocab: { et: string; en: string }[] = [];
  const body: string[] = [];

  for (const line of lines) {
    const match = /^VOCAB:\s*(.+?)\s*\|\s*(.+?)\s*$/.exec(line.trim());
    if (match?.[1] && match[2]) vocab.push({ et: match[1], en: match[2] });
    else body.push(line);
  }
  return { body: body.join("\n").trim(), vocab };
}

/**
 * Pulls the trailing UNVERIFIED: line out of the reply.
 *
 * `app/api/tutor/route.ts` appends this itself, after streaming ends, once it
 * has checked Anu's own prose (never a FIX: or VOCAB: line, both already
 * boxed and tagged below) against the dictionary the way a scanned word is
 * checked (ADR-021). It cannot withhold what has already streamed to the
 * screen, so this is the honest alternative: name exactly which word was not
 * one the dictionary could confirm.
 */
function splitUnverified(content: string): { body: string; unverified: string[] } {
  const lines = content.split("\n");
  const unverified: string[] = [];
  const body: string[] = [];

  for (const line of lines) {
    const match = /^UNVERIFIED:\s*(.+)$/.exec(line.trim());
    if (match?.[1]) unverified.push(...match[1].split(",").map((w) => w.trim()).filter(Boolean));
    else body.push(line);
  }
  return { body: body.join("\n").trim(), unverified };
}

function UnverifiedNotice({ words }: { words: string[] }) {
  const plural = words.length > 1;
  return (
    <div
      className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 rounded-[var(--r)] px-4 py-3 text-sm"
      style={{ background: "var(--again-soft)", color: "var(--again-ink)" }}
    >
      <Chip tone="again" title="Not a stored form, so the dictionary could not confirm it">
        AI · verify
      </Chip>
      <span>{plural ? "Anu used words above" : "Anu used a word above"} the dictionary does not recognise yet:</span>
      <span>
        {words.map((w, i) => (
          <span key={w}>
            {i > 0 && ", "}
            <span lang="et" className="font-semibold">{w}</span>
          </span>
        ))}.
      </span>
      <span>Check {plural ? "them" : "it"} before you trust {plural ? "them" : "it"}.</span>
    </div>
  );
}

/**
 * Pulls the corrected sentence out, so it can be shown as the model's own work.
 *
 * The point is the label, not the layout: a learner reading a paragraph of
 * grammar has no way to tell which of the Estonian in it came from a
 * lexicographer and which from a language model. Here, one of them is boxed and
 * tagged.
 */
function splitFix(content: string): { rest: string; fix: string | null } {
  // Models number their answers, so the marker arrives as "3. FIX:" as often as
  // "FIX:". Matching only the bare form left the corrected sentence buried in
  // the paragraph, unlabelled — which is the one thing this box exists to fix.
  const marker = /^(?:\d+[.)]\s*)?FIX:\s*/i;
  const lines = content.split("\n");
  const index = lines.findIndex((l) => marker.test(l.trim()));
  if (index === -1) return { rest: content, fix: null };
  const fix = lines[index]!.trim().replace(marker, "").trim();
  return {
    rest: [...lines.slice(0, index), ...lines.slice(index + 1)].join("\n").trim(),
    fix: fix || null,
  };
}

export function SentenceCheck({
  open, estonian, meaning, streaming, onOpen, onClose, onEstonian, onMeaning, onSubmit,
}: {
  open: boolean;
  estonian: string;
  meaning: string;
  streaming: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEstonian: (value: string) => void;
  onMeaning: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex items-center gap-2 self-start rounded-full border px-4 py-2 text-sm font-medium"
        style={{ borderColor: "var(--accent)", color: "var(--accent-deep)", background: "var(--accent-soft)" }}
      >
        <CheckCheck size={15} aria-hidden /> Check a sentence I wrote
      </button>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="label-xs" style={{ color: "var(--ink-3)" }}>Check a sentence</span>
        <button type="button" onClick={onClose} className="text-xs" style={{ color: "var(--ink-3)" }}>
          Close
        </button>
      </div>
      <EstonianInput
        value={estonian}
        onChange={onEstonian}
        placeholder="Ma lugesin raamatu eile õhtul."
        ariaLabel="The Estonian sentence you wrote"
        autoFocus
      />
      <input
        value={meaning}
        onChange={(e) => onMeaning(e.target.value)}
        placeholder="What you meant, in English (optional but it helps)"
        aria-label="What you meant, in English"
        className="mt-2 w-full rounded-md border px-3.5 py-2.5 text-base"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" onClick={onSubmit} disabled={streaming || estonian.trim().length < 3}>
          <CheckCheck size={15} aria-hidden /> Check it
        </Button>
        <span className="text-xs" style={{ color: "var(--ink-3)" }}>
          Anu names the rule before the fix, and says so when she is unsure rather than guessing.
        </span>
      </div>
    </Card>
  );
}

function VocabBridge({ vocab }: { vocab: { et: string; en: string }[] }) {
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const add = (word: { et: string; en: string }) => {
    start(async () => {
      const created = await createLexeme({
        lemma: word.et, translation: word.en, pos: "OTHER", notes: "Suggested by Anu, forms unverified",
      });
      if (created.ok) {
        await addToDeck(created.id, ["RECOGNITION", "PRODUCTION"], "TUTOR");
        setAdded((s) => new Set(s).add(word.et));
      }
    });
  };

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--rule-soft)" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="label-xs" style={{ color: "var(--ink-3)" }}>Vocabulary</span>
        <Chip tone="again" title="Anu's forms are not authoritative, check them in the dictionary">
          AI · verify
        </Chip>
      </div>
      <ul className="flex flex-col gap-1.5">
        {vocab.map((w) => (
          <li key={w.et} className="flex items-center justify-between gap-3">
            <span className="text-sm">
              <span className="font-semibold" style={{ color: "var(--ink)" }}>{w.et}</span>
              <span style={{ color: "var(--ink-3)" }}>, {w.en}</span>
            </span>
            <Button
              variant="ghost"
              disabled={pending || added.has(w.et)}
              onClick={() => add(w)}
              aria-label={`Add "${w.et}" to your deck`}
            >
              {added.has(w.et) ? "Added" : <><Plus size={14} aria-hidden /> Add</>}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
