"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { getTutorHistory } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Card, Empty } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { useAnuChat } from "./useAnuChat";
import { AnuFailure, Bubble, CHIPS, Provenance, SentenceCheck, sentenceCheckPrompt } from "./AnuParts";

/**
 * Anu, reachable from anywhere: a button in the bottom right corner of every
 * signed-in screen, opening the same conversation the `/tutor` page shows.
 *
 * Mounted once in `app/(app)/layout.tsx`, which the App Router does not remount
 * on client-side navigation, so the open panel and the conversation inside it
 * survive moving between pages exactly the way the rest of the app's global
 * chrome (the command palette, the install prompt) already does. Hidden on
 * `/tutor` itself, which renders the same conversation full-page: without that,
 * a learner there would see two copies of one exchange and two boxes to type
 * into.
 */
export function AnuFab({
  configured, readerCanConfigure, plannedLabel,
}: {
  configured: boolean;
  readerCanConfigure: boolean;
  plannedLabel: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const { messages, setMessages, streaming, answeredBy, failure, send } = useAnuChat([]);
  const [input, setInput] = useState("");
  const [checkOpen, setCheckOpen] = useState(false);
  const [checkEt, setCheckEt] = useState("");
  const [checkEn, setCheckEn] = useState("");

  // Loaded once, the first time the panel opens, rather than on every page:
  // this component stays mounted across navigation, so fetching on mount
  // would ask the database for a conversation nobody is looking at yet.
  useEffect(() => {
    if (!open || historyLoaded || !configured) return;
    setHistoryLoaded(true);
    void getTutorHistory().then((history) => {
      if (history.length > 0) setMessages(history);
    });
  }, [open, historyLoaded, configured, setMessages]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname === "/tutor") return null;

  return (
    <div className="bottom-notice fixed right-[max(1rem,env(safe-area-inset-right))] z-[90] flex flex-col items-end">
      {open ? (
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Ask Anu"
          className="flex w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[var(--r-xl)] border"
          style={{
            maxHeight: "min(36rem, calc(100dvh - 7rem))",
            borderColor: "var(--rule)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <header className="flex items-center gap-2.5 border-b px-4 py-3" style={{ borderColor: "var(--rule)" }}>
            <Mascot size={26} className="shrink-0" animate={false} />
            <p className="flex-1 text-base font-bold" style={{ color: "var(--ink)" }}>Anu</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Anu"
              className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"
              style={{ color: "var(--ink-3)" }}
            >
              <X size={17} aria-hidden />
            </button>
          </header>

          <div className="scroll-host flex-1 overflow-y-auto px-4 py-4">
            {!configured ? (
              <Empty
                title={readerCanConfigure ? "Anu needs an API key" : "Anu is not available"}
                body={readerCanConfigure
                  ? "Everything else in the app works without one. Settings has a two-minute walkthrough for getting a free key."
                  : "Anu is not switched on for this site yet. Everything else here works without her."}
                action={readerCanConfigure && (
                  <Button onClick={() => { window.location.href = "/settings"; }}>Open Settings</Button>
                )}
              />
            ) : messages.length === 0 ? (
              <Card tone="blush" className="flex items-start gap-3 p-4">
                <Mascot size={36} className="float shrink-0" />
                <div>
                  <p className="text-base font-bold" style={{ color: "var(--ink)" }}>Tere! Ma olen Anu.</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    Ask me anything about Estonian grammar. I&rsquo;ll say so if I&rsquo;m not sure of a
                    form rather than guessing.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="flex flex-col gap-3" role="log" aria-live="polite" aria-label="Conversation with Anu">
                {messages.map((m, i) => (
                  <Bubble key={i} message={m} streaming={streaming && i === messages.length - 1} />
                ))}
              </div>
            )}
          </div>

          {configured && (
            <div className="flex flex-col gap-2.5 border-t px-4 py-3" style={{ borderColor: "var(--rule)" }}>
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

              <div className="flex flex-wrap gap-1.5">
                {CHIPS.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => setInput(c.prompt)}
                    className="press rounded-full px-3 py-1.5 text-2xs font-semibold transition-ui hover:-translate-y-px"
                    style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <EstonianInput
                    value={input}
                    onChange={setInput}
                    onEnter={() => { void send(input); setInput(""); }}
                    placeholder="Why is it raamatut and not raamatu?"
                    ariaLabel="Ask Anu a question"
                  />
                </div>
                <Button
                  variant="primary"
                  onClick={() => { void send(input); setInput(""); }}
                  disabled={streaming || !input.trim()}
                  aria-label={streaming ? "Anu is thinking" : "Ask"}
                >
                  {streaming ? "…" : "Ask"}
                </Button>
              </div>

              <AnuFailure failure={failure} />
              <Provenance label={answeredBy ?? plannedLabel} answered={answeredBy !== null} />
            </div>
          )}
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask Anu"
          title="Ask Anu"
          className="press lift flex h-14 w-14 items-center justify-center rounded-full border"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-lg)" }}
        >
          <Mascot size={32} />
        </button>
      )}
    </div>
  );
}
