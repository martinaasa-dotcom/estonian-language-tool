"use client";

import { useState } from "react";

export interface Msg { role: "user" | "assistant"; content: string }

/**
 * The streaming exchange with `/api/tutor`, shared by the full `/tutor` page
 * and the floating Anu button so the two never drift into two ways of
 * talking to the same route.
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

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || streaming) return;

    const next: Msg[] = [...messages, { role: "user", content }];
    setMessages(next);
    setStreaming(true);
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, level: "B1" }),
      });

      const provider = res.headers.get("x-model-provider");
      const model = res.headers.get("x-model-id");
      if (provider && model) setAnsweredBy(`${provider} · ${model}`);

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
        content: "⚠ Lost the connection to Anu. Your question is still in the box above. Try again.",
      }]);
    } finally {
      setStreaming(false);
    }
  };

  return { messages, setMessages, streaming, answeredBy, send };
}
