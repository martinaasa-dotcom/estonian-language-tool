"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Plus, Send, Sparkles } from "lucide-react";
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

export function TutorChat({
  configured, providerLabel, history,
}: {
  configured: boolean;
  providerLabel: string | null;
  history: Msg[];
}) {
  const [messages, setMessages] = useState<Msg[]>(history);
  const [input, setInput] = useState("");
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

function Bubble({ message, streaming }: { message: Msg; streaming: boolean }) {
  const isUser = message.role === "user";
  const { body, vocab } = splitVocab(message.content);

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
        {isUser ? "You" : "Anu"}
      </p>
      <div className="whitespace-pre-wrap text-[14.5px] leading-relaxed" style={{ color: "var(--ink)" }}>
        {body}
        {streaming && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
      </div>
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
