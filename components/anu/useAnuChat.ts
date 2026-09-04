"use client";

import { useState } from "react";

export interface Msg { role: "user" | "assistant"; content: string }

/**
 * The exchange with `/api/tutor`, shared by the full `/tutor` page and the
 * floating Anu button so the two never drift into two ways of talking to the
 * same route. The route streams; the screen waits for the whole reply and
 * shows it once, for the reason given beside the read loop.
 *
 * Owns the conversation and who answered it; does not own the input box,
 * because two different surfaces want to clear it differently (a page can
 * refocus the field, a panel might close instead).
 */
export function useAnuChat(initialMessages: Msg[]) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [streaming, setStreaming] = useState(false);
  /*
    The model that wrote the answer on screen, read off the reply itself.

    `null` until one has, and then it stays: a learner who scrolls back to
    yesterday's answer is reading something a specific model wrote, and the
    line under the conversation should not quietly go back to naming whichever
    key happens to be first in the environment today.
  */
  const [answeredBy, setAnsweredBy] = useState<string | null>(null);
  /*
    The last thing that went wrong, kept out of the transcript.

    The failure is written into the conversation too, because that is where a
    learner is looking, but a report button cannot live there: it would be a
    control inside a message, in a thread that is sent back to the model as
    context next time. So the fact of it is held here, where both surfaces
    that use this hook can offer a way to tell somebody.
  */
  const [failure, setFailure] = useState<string | null>(null);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;

    const next: Msg[] = [...messages, { role: "user", content }];
    setFailure(null);
    setMessages(next);
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);
    // Whatever has arrived so far, kept outside the try so a connection lost
    // halfway through an answer still hands over the half that landed.
    let acc = "";

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Who is asking, and at what level, is the server's to know.
        body: JSON.stringify({ messages: next }),
      });

      const provider = res.headers.get("x-model-provider");
      const model = res.headers.get("x-model-id");
      if (provider && model) setAnsweredBy(`${provider} · ${model}`);

      if (!res.ok || !res.body) {
        const { error } = await res.json().catch(() => ({ error: "Anu could not be reached." }));
        setFailure(String(error));
        setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: `⚠ ${error}` }]);
        return;
      }

      /*
        THE REPLY IS SHOWN ONCE, FINISHED, AND NOT A WORD AT A TIME.

        The route still streams, and should: a two-minute route that says
        nothing until the end is what a proxy times out and what a learner
        reads as broken, and the server's own cleaning pass is built on the
        stream. What changed is what the screen does with it. A reply drawn
        as it arrived was a paragraph whose bold opened three words before
        it closed, a list that was one line beginning "1." for a second and a
        list the next, and a FIX: box that appeared, moved and reflowed under
        the reader's eyes. A typed reply is typography, and typography set a
        character at a time is never clean while it is being set.

        So the chunks are gathered here and the bubble shows that Anu is
        writing until they have all landed, then the finished reply in one
        go, parsed and drawn as a whole. What it costs is the sight of words
        arriving; what it buys is that the first thing a learner reads is
        the answer as she meant it to look, which is the trade the reader
        asked for by name.
      */
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
      }
      acc += decoder.decode();
      setMessages((m) => [...m.slice(0, -1), { role: "assistant", content: acc }]);
    } catch {
      setFailure("Lost the connection to Anu mid-answer.");
      const half = acc.trim() ? `${acc.trim()}\n\n` : "";
      setMessages((m) => [...m.slice(0, -1), {
        role: "assistant",
        content: `${half}⚠ Lost the connection to Anu. Your question is still in the box above. Try again.`,
      }]);
    } finally {
      setStreaming(false);
    }
  };

  return { messages, setMessages, streaming, answeredBy, failure, send };
}
