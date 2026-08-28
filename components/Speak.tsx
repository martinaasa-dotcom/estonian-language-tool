"use client";

import { Volume2, Loader2 } from "lucide-react";
import { useState, type CSSProperties } from "react";

const cache = new Map<string, string>();

/**
 * Pronunciation button.
 *
 * Audio comes from TartuNLP's Estonian neural TTS via our own proxy, because the
 * browser's speechSynthesis has no dependable et-EE voice — it fails silently, or
 * reads Estonian in an English accent. If the proxy cannot produce audio the button
 * disappears rather than sitting there doing nothing.
 */
export function Speak({ text, slow, label, size = 15, className, style }: {
  text: string; slow?: boolean; label?: string;
  /** Icon size in px, plus className/style overrides for a bigger tap target (e.g. Listening mode). */
  size?: number; className?: string; style?: CSSProperties;
}) {
  const [state, setState] = useState<"idle" | "loading" | "gone">("idle");

  if (state === "gone") return null;

  const play = async () => {
    const key = `${text}|${slow ? 0.6 : 1}`;
    try {
      setState("loading");
      let url = cache.get(key);
      if (!url) {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, speed: slow ? 0.6 : 1 }),
        });
        if (!res.ok) throw new Error(String(res.status));
        url = URL.createObjectURL(await res.blob());
        cache.set(key, url);
      }
      await new Audio(url).play();
      setState("idle");
    } catch {
      setState("gone");
    }
  };

  return (
    <button
      type="button"
      onClick={play}
      disabled={state === "loading"}
      aria-label={label ?? `Hear "${text}"${slow ? " slowly" : ""} in Estonian`}
      className={className ?? "press inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"}
      style={{ color: "var(--ink-3)", ...style }}
    >
      {state === "loading"
        ? <Loader2 size={size} className="animate-spin" aria-hidden />
        : <Volume2 size={size} strokeWidth={2} aria-hidden />}
    </button>
  );
}
