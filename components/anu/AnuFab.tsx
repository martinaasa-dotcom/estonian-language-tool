"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { getTutorHistory } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Card, Empty } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { useAnuChat } from "./useAnuChat";
import { useStickToBottom } from "./useStickToBottom";
import { AnuFailure, Bubble, Provenance, SentenceCheck, Starters, sentenceCheckPrompt } from "./AnuParts";

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
  const boxRef = useRef<HTMLInputElement>(null);
  const conversation = useStickToBottom(messages);

  /*
    Whether this panel is still an invitation or is now a conversation.

    Everything that says "here is how to begin" belongs to the first state and
    nothing else does. The panel used to carry all of it at once: a greeting, a
    bordered button offering to check a sentence, six starters over three rows
    and three lines of grey provenance, stacked under whatever was being said,
    so a learner reading an answer about the partitive was reading it through a
    menu they had already used. That is the whole of why it read as busy.

    Withheld rather than deleted, which is the same distinction `lib/ux/`
    draws: this is the compact surface, and `/tutor` is the same conversation
    with room around it and every starter always on screen.
  */
  const asked = messages.length > 0;

  const pick = (prompt: string) => {
    setInput(prompt);
    boxRef.current?.focus();
  };

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
            <Mascot size={26} className="shrink-0" blink={false} />
            <p className="est flex-1 text-base font-bold" style={{ color: "var(--ink)" }}>Anu</p>
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
            ) : !asked ? (
              <div className="flex flex-col gap-4">
                {/* No second mascot, and no `p-4`. The panel's own header carries
                    a mascot three centimetres above this card, and at 36px in a
                    column of its own it spent a sixth of a 24rem panel's width
                    saying a thing already on screen. The padding was a class that
                    did nothing: `Card` sets `p-5 md:p-6`, and a `md:` variant beats
                    an unprefixed utility whatever order they are written in, so
                    every desktop reading of this card was `p-6` while the source
                    said otherwise. The full page has no header of its own and keeps
                    her mascot. */}
                <Card tone="blush">
                  <p className="est text-base font-bold" style={{ color: "var(--ink)" }}>Tere! Ma olen Anu.</p>
                  <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                    Ask me anything about Estonian grammar. I&rsquo;ll name the rule, say when
                    I&rsquo;m unsure rather than guessing, and mark any Estonian I write as mine.
                  </p>
                </Card>

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

                <Starters compact onPick={pick} />
              </div>
            ) : (
              <div
                ref={conversation}
                className="flex flex-col gap-3"
                role="log"
                aria-live="polite"
                aria-label="Conversation with Anu"
              >
                {messages.map((m, i) => (
                  <Bubble key={i} message={m} streaming={streaming && i === messages.length - 1} />
                ))}
              </div>
            )}
          </div>

          {configured && (
            <div className="flex flex-col gap-2.5 border-t px-4 py-3" style={{ borderColor: "var(--rule)" }}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <EstonianInput
                    value={input}
                    onChange={setInput}
                    onEnter={() => { void send(input); setInput(""); }}
                    placeholder="Why is it raamatut and not raamatu?"
                    ariaLabel="Ask Anu a question"
                    inputRef={boxRef}
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
              <Provenance compact label={answeredBy ?? plannedLabel} answered={answeredBy !== null} />
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
