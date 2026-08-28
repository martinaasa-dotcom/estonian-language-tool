"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckCheck, Plus, Send, Sparkles } from "lucide-react";
import { createLexeme, addToDeck } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Card, Chip, Empty } from "@/components/ui";

interface Msg { role: "user" | "assistant"; content: string }

const CHIPS = [
  { label: "Break this sentence down", prompt: "Break this Estonian sentence down morpheme by morpheme, labelling each case: " },
  { label: "Which case, and why?", prompt: "Which case should I use here, and what is the rule? " },
  { label: "Object case check", prompt: "Is the object case right in this sentence — total or partial? Explain the aspect: " },
  { label: "Explain this gradation", prompt: "Explain the consonant gradation in this word and name the pattern: " },
  { label: "Correct my Estonian", prompt: "Correct my Estonian and explain each change: " },
  { label: "Quiz me", prompt: "Quiz me with five short B1-level Estonian questions, one at a time." },
];

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
function sentenceCheckPrompt(estonian: string, meaning: string): string {
  return [
    "Check this sentence for me.",
    "",
    `Estonian: "${estonian.trim()}"`,
    meaning.trim() ? `What I meant: "${meaning.trim()}"` : "",
    "",
    "Please:",
    "1. Say plainly whether it is correct.",
    "2. For each mistake, name the rule first — which case and why, the gradation pattern, the verb's government, or the word order — and only then the fix.",
    "3. Put the corrected sentence on its own final line, starting with FIX:",
    "4. If you are not certain of a form, say so and tell me which word to look up in the dictionary rather than guessing.",
  ].filter(Boolean).join("\n");
}

export function TutorChat({
  configured, providerLabel, history,
}: {
  configured: boolean;
  providerLabel: string | null;
  history: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(history);
  const [input, setInput] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkEt, setCheckEt] = useState("");
  const [checkEn, setCheckEn] = useState("");
  const [streaming, setStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;

    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, level: "B1" }),
      });

      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: "Anu could not be reached." }));
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: `⚠ ${error}` }]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: acc }]);
      }
    } catch {
      setMessages((m) => [...m.slice(0, -1), {
        role: "assistant",
        content: "⚠ Lost the connection to Anu. Your question is still in the box above — try again.",
      }]);
    } finally {
      setStreaming(false);
    }
  };

  if (!configured) {
    return (
      <Empty
        title="Anu needs an API key"
        body="Everything else in the app works without one — the dictionary, your cards and audio are all local. Settings has a two-minute walkthrough for getting a free key."
        action={<Button onClick={() => { window.location.href = "/settings"; }}>Open Settings</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.length === 0 ? (
        <Card>
          <div className="flex items-center gap-2">
            <Sparkles size={17} style={{ color: "var(--accent)" }} aria-hidden />
            <p className="est text-[19px] font-semibold" style={{ color: "var(--ink)" }}>Tere! Ma olen Anu.</p>
          </div>
          <p className="mt-2 text-[14.5px]" style={{ color: "var(--ink-2)" }}>
            Ask me anything about Estonian grammar. I&rsquo;ll always tell you the rule, not just the
            answer — and I&rsquo;ll say so if I&rsquo;m not sure of a form rather than guessing.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4" role="log" aria-live="polite" aria-label="Conversation with Anu">
          {messages.map((m, i) => <Bubble key={i} message={m} streaming={streaming && i === messages.length - 1} />)}
          <div ref={endRef} />
        </div>
      )}

      <SentenceCheck
        open={checkOpen}
        estonian={checkEt}
        meaning={checkEn}
        streaming={streaming}
        onOpen={() => setCheckOpen(true)}
        onClose={() => setCheckOpen(false)}
        onEstonian={setCheckEt}
        onMeaning={setCheckEn}
        onSubmit={() => {
          void send(sentenceCheckPrompt(checkEt, checkEn));
          setCheckEt("");
          setCheckEn("");
          setCheckOpen(false);
        }}
      />

      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setInput(c.prompt)}
            className="rounded-full border px-3 py-1.5 text-[13px] transition-opacity hover:opacity-70"
            style={{ borderColor: "var(--rule)", color: "var(--ink-2)", background: "var(--surface)" }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex-1">
          <EstonianInput
            value={input}
            onChange={setInput}
            onEnter={() => void send(input)}
            placeholder="Why is it raamatut and not raamatu?"
            ariaLabel="Ask Anu a question"
          />
        </div>
        <Button
          variant="primary"
          onClick={() => void send(input)}
          disabled={streaming || !input.trim()}
          className="py-2.5"
        >
          <Send size={15} aria-hidden /> {streaming ? "Thinking…" : "Ask"}
        </Button>
      </div>

      {providerLabel && (
        <p className="text-[11.5px]" style={{ color: "var(--ink-3)" }}>
          {providerLabel} · Anu explains grammar; inflected forms in the dictionary come from stored
          data, not from the model.
        </p>
      )}
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

function Bubble({ message, streaming }: { message: Msg; streaming: boolean }) {
  const isUser = message.role === "user";
  const { body, vocab } = splitVocab(message.content);
  const { rest, fix } = splitFix(isUser ? displayUserContent(body) : body);

  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{
        borderColor: isUser ? "transparent" : "var(--rule)",
        background: isUser ? "var(--accent-soft)" : "var(--surface)",
        marginLeft: isUser ? "auto" : 0,
        maxWidth: isUser ? "85%" : "100%",
      }}
    >
      <p className="label-xs mb-1.5" style={{ color: isUser ? "var(--accent)" : "var(--ink-3)" }}>
        {isUser
          ? message.content.startsWith("Check this sentence for me.") ? "You — sentence to check" : "You"
          : "Anu"}
      </p>
      <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed" style={{ color: "var(--ink)" }}>
        {rest}
        {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
      </div>
      {fix && (
        <div
          className="mt-3 rounded-md px-4 py-3"
          style={{ background: "var(--accent-soft)" }}
        >
          <div className="mb-1 flex items-center gap-2">
            <span className="label-xs" style={{ color: "var(--accent)" }}>Corrected</span>
            <Chip tone="again" title="Anu wrote this. The dictionary's forms are stored data; this is not.">
              AI · verify
            </Chip>
          </div>
          <p lang="et" className="est text-[17px]" style={{ color: "var(--ink)" }}>{fix}</p>
        </div>
      )}
      {vocab.length > 0 && <VocabBridge vocab={vocab} />}
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

function SentenceCheck({
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
        className="flex items-center gap-2 self-start rounded-full border px-4 py-2 text-[13.5px] font-medium"
        style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "var(--accent-soft)" }}
      >
        <CheckCheck size={15} aria-hidden /> Check a sentence I wrote
      </button>
    );
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="label-xs" style={{ color: "var(--ink-3)" }}>Check a sentence</span>
        <button type="button" onClick={onClose} className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
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
        className="mt-2 w-full rounded-md border px-3.5 py-2.5 text-[15px]"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      <div className="mt-3 flex items-center gap-3">
        <Button variant="primary" onClick={onSubmit} disabled={streaming || estonian.trim().length < 3}>
          <CheckCheck size={15} aria-hidden /> Check it
        </Button>
        <span className="text-[12px]" style={{ color: "var(--ink-3)" }}>
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
        lemma: word.et, translation: word.en, pos: "OTHER", notes: "Suggested by Anu — forms unverified",
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
        <Chip tone="again" title="Anu's forms are not authoritative — check them in the dictionary">
          AI · verify
        </Chip>
      </div>
      <ul className="flex flex-col gap-1.5">
        {vocab.map((w) => (
          <li key={w.et} className="flex items-center justify-between gap-3">
            <span className="text-[14px]">
              <span className="est font-semibold" style={{ color: "var(--ink)" }}>{w.et}</span>
              <span style={{ color: "var(--ink-3)" }}> — {w.en}</span>
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
