"use client";

import { Volume2, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { fetchClip } from "@/lib/audio/clip";
import { useAudioPrefs } from "./AudioPrefs";

/**
 * Pronunciation button.
 *
 * Audio comes from TartuNLP's Estonian neural TTS via our own proxy, because the
 * browser's speechSynthesis has no dependable et-EE voice — it fails silently, or
 * reads Estonian in an English accent. If the proxy cannot produce audio the button
 * disappears rather than sitting there doing nothing.
 *
 * The voice is the learner's own, read from the shell (components/AudioPrefs.tsx),
 * and `autoplay` reads the clip aloud the moment the button appears, once, if
 * they have that switched on. A browser refuses to play sound on a page nobody
 * has touched yet, and that refusal is not a fault in the service: it leaves the
 * button in place to be pressed, where a clip that could not be fetched at all
 * takes the button away.
 */
export function Speak({
  text, slow, label, size = 15, className, style, onUnavailable, onPlay, disabled, children, autoplay,
}: {
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
  /**
   * Called when a play actually starts, which is what the exam counts.
   *
   * The listening part of the state examination plays each recording twice, so
   * the mock has to count plays, and it has to count the ones that happened: an
   * increment on the click would charge somebody for a request that failed and
   * left them with nothing to hear. Fired after `play()` resolves, so a clip
   * that would not load costs no play and takes the `onUnavailable` path
   * instead.
   */
  onPlay?: () => void;
  /** Held shut, for the pause before a listening task and for a spent budget. */
  disabled?: boolean;
  /**
   * What the button draws when it is not loading. The speaker icon by default;
   * a word where the icon would be ambiguous, which is what `SpeakPair` needs
   * for its slow half.
   */
  children?: ReactNode;
  /**
   * Read it aloud as soon as this appears, if the learner's setting allows.
   * For the moment a word is met and the moment an answer is shown, which are
   * the two moments hearing it does the most, and never for a sentence with a
   * hole in it. Counts as a play for `onPlay`, since it is one.
   */
  autoplay?: boolean;
}) {
  const [state, setState] = useState<"idle" | "loading" | "gone">("idle");
  const { voice, autoplay: wanted } = useAudioPrefs();
  const played = useRef<string | null>(null);

  const play = async (unasked = false) => {
    try {
      setState("loading");
      const url = await fetchClip({ text, slow, voice });
      try {
        await new Audio(url).play();
      } catch (error) {
        /*
          The clip is here and the browser would not play it, which on a page
          nobody has touched yet is the autoplay policy and not the service.
          Leave the button to be pressed. A press is a user gesture and will
          be allowed, so the same error on a press is genuinely something else.
        */
        if (unasked && error instanceof DOMException && error.name === "NotAllowedError") {
          setState("idle");
          return;
        }
        throw error;
      }
      setState("idle");
      onPlay?.();
    } catch {
      setState("gone");
      onUnavailable?.();
    }
  };

  useEffect(() => {
    if (!autoplay || wanted !== "on" || disabled) return;
    const key = `${text}|${slow ? 1 : 0}`;
    if (played.current === key) return;
    played.current = key;
    void play(true);
    // `play` closes over the props it needs; re-running on them would replay
    // the same clip on an unrelated re-render, which `played` also guards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, wanted, disabled, text, slow]);

  if (state === "gone") return null;

  return (
    <button
      type="button"
      onClick={() => void play()}
      disabled={disabled || state === "loading"}
      aria-label={label ?? `Hear "${text}"${slow ? " slowly" : ""} in Estonian`}
      className={className ?? "press inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--raised)]"}
      style={{ color: "var(--ink-3)", opacity: disabled ? 0.4 : undefined, ...style }}
    >
      {state === "loading"
        ? <Loader2 size={size} className="animate-spin" aria-hidden />
        : children ?? <Volume2 size={size} strokeWidth={2} aria-hidden />}
    </button>
  );
}

/**
 * The two speeds, as one control.
 *
 * Normal and slow were two identical speaker buttons sitting side by side, and
 * an icon repeated with nothing to tell the copies apart reads as a rendering
 * fault rather than as a choice. It was also unanswerable: the only way to find
 * out what the second one did was to press it, since the difference was carried
 * by a `title` attribute, and a phone has no hover. That is the rule dictation
 * met first, one layer down: a distinction the learner has to act on is carried
 * in words, never by a hue or a hover.
 *
 * So: one pill, a divider, and the slow half says "Slow". One control with two
 * speeds, legible without pressing anything.
 *
 * The pair goes away as a pair. Both halves ask the same service for the same
 * sentence, so a failure is a fact about the service rather than about a speed,
 * and letting one half vanish on its own would leave a stray divider against a
 * lone button.
 */
export function SpeakPair({
  text, label, slowLabel, disabled, onPlay, onUnavailable, size = 15, className = "", autoplay,
}: {
  text: string;
  label?: string;
  slowLabel?: string;
  disabled?: boolean;
  size?: number;
  className?: string;
  onPlay?: () => void;
  onUnavailable?: () => void;
  /** Reads the normal-speed half aloud on appearing, as `Speak` does. */
  autoplay?: boolean;
}) {
  const [gone, setGone] = useState(false);
  if (gone) return null;

  const lost = () => {
    setGone(true);
    onUnavailable?.();
  };

  const half = "press tap-tint inline-flex items-center justify-center rounded-full";

  return (
    <span
      className={`inline-flex items-center rounded-full border ${className}`}
      style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
    >
      <Speak
        text={text}
        size={size}
        label={label ?? `Hear "${text}" in Estonian`}
        disabled={disabled}
        onPlay={onPlay}
        onUnavailable={lost}
        autoplay={autoplay}
        className={`${half} px-2.5 py-1.5`}
        style={{ color: "var(--ink-2)" }}
      />
      <span aria-hidden className="h-4 w-px shrink-0" style={{ background: "var(--rule)" }} />
      <Speak
        text={text}
        slow
        size={size}
        label={slowLabel ?? `Hear "${text}" slowly in Estonian`}
        disabled={disabled}
        onPlay={onPlay}
        onUnavailable={lost}
        className={`${half} gap-1 px-2.5 py-1.5 text-xs font-semibold`}
        style={{ color: "var(--ink-3)" }}
      >
        Slow
      </Speak>
    </span>
  );
}
