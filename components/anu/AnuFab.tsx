"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { getTutorHistory } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Empty } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { useAnuChat } from "./useAnuChat";
import { useStickToBottom } from "./useStickToBottom";
import { AnuFailure, Bubble, CheckStarter, Provenance, SentenceCheck, Starters, sentenceCheckPrompt } from "./AnuParts";

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
  configured, readerCanConfigure,
}: {
  configured: boolean;
  readerCanConfigure: boolean;
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
    menu they had already used. That is where this started, and withholding the
    lot once a question has been asked was only half of it: on the first screen
    of a panel nobody had asked anything on yet, all of it was still there at
    once. What is left is one row of ways in.

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
          {/*
            One line under her name, and it says whichever of two things is
            true. Before a reply it is what Anu is for and how to read her,
            which is the useful half of the greeting card that used to open
            this panel; after one it names the model that actually wrote what
            is on screen. Neither belongs in the conversation: the greeting was
            a card the width of the panel that a learner scrolled past to reach
            the answer they asked for, and the provider line was three lines of
            grey under the box they type into. Both are facts about Anu rather
            than turns in the conversation, so they sit in her chrome, where
            they cost the thread nothing.
          */}
          <header className="flex items-center gap-2.5 border-b px-4 py-3" style={{ borderColor: "var(--rule)" }}>
            <Mascot size={26} className="shrink-0" animate={false} />
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold leading-snug" style={{ color: "var(--ink)" }}>Anu</p>
              {configured && (
                answeredBy
                  ? <Provenance compact label={answeredBy} answered />
                  : <p className="text-2xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
                      Names the rule, and marks her own Estonian.
                    </p>
              )}
            </div>
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
                  ? "Everything else works without one. Settings has a walkthrough for a free key."
                  : "Everything else here works without her."}
                action={readerCanConfigure && (
                  <Button onClick={() => { window.location.href = "/settings"; }}>Open Settings</Button>
                )}
              />
            ) : !asked ? (
              /*
                Seven ways in, in one row of pills, and nothing else.

                The greeting is gone from here: a card the width of the panel,
                a bordered button on a line of its own and six long starters
                over three rows meant that opening Anu showed a learner four
                separate blocks before the box they type into. What each of
                those said was true; there was simply too much of it, which is
                the one way copy stops being read that no voice rule can see.
                What survives is every way in that was here, at the length this
                surface has room for, plus the check that leads them.
              */
              checkOpen ? (
                <SentenceCheck
                  open
                  compact
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
              ) : (
                <Starters
                  compact
                  onPick={pick}
                  lead={<CheckStarter compact onOpen={() => setCheckOpen(true)} />}
                />
              )
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
