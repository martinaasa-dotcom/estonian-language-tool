"use client";

import { Volume2, Loader2 } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { cachedClip, rememberClip } from "@/lib/audio/clipCache";

/**
 * Pronunciation button.
 *
 * Audio comes from TartuNLP's Estonian neural TTS via our own proxy, because the
 * browser's speechSynthesis has no dependable et-EE voice — it fails silently, or
 * reads Estonian in an English accent. If the proxy cannot produce audio the button
 * disappears rather than sitting there doing nothing.
 */
export function Speak({ text, slow, label, size = 15, className, style, onUnavailable }: {
  text: string; slow?: boolean; label?: string;
  /** Icon size in px, plus className/style overrides for a bigger tap target (e.g. Listening mode). */
  size?: number; className?: string; style?: CSSProperties;
  /**
   * Called when the audio could not be produced and this button is about to
   * remove itself. Most screens can lose a pronunciation button silently; the
   * ones built *on* the audio (Listening, Dictation) cannot, and need to offer
   * something else instead of a dead end.
   */
  onUnavailable?: () => void;
}) {
  const [state, setState] = useState<"idle" | "loading" | "gone">("idle");

  if (state === "gone") return null;

  const play = async () => {
    const key = `${text}|${slow ? 0.6 : 1}`;
    try {
      setState("loading");
      /*
        Held in lib/audio/clipCache.ts rather than in a `Map` here. That map
        was module-level and never revoked one of its object URLs, so a tab
        left open through a few review sessions kept every clip it had ever
        played. The cache is bounded and revokes what it evicts now, and it is
        shared with the listening round, so a word met in both is one clip.
      */
      let url = cachedClip(key);
      if (!url) {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, speed: slow ? 0.6 : 1 }),
        });
        if (!res.ok) throw new Error(String(res.status));
        url = rememberClip(key, await res.blob());
      }
      await new Audio(url).play();
      setState("idle");
    } catch {
      setState("gone");
      onUnavailable?.();
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
