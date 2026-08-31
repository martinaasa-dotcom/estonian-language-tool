"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Play, Square } from "lucide-react";

type State = "idle" | "recording" | "ready" | "unavailable";

/**
 * Record yourself, and play it back next to the native voice.
 *
 * What this deliberately does **not** do is score the recording. There is no
 * verified Estonian speech-recogniser available to this app — TartuNLP publish
 * a text-to-speech service, which is what the rest of the app uses, and nothing
 * comparable for the other direction (docs/13-mvp-status.md). A confidence
 * number invented on top of a browser API that does not support Estonian would
 * be worse than silence: a learner would trust it.
 *
 * So this is shadowing, the technique interpreters actually train with: hear it,
 * say it, hear both back, judge for yourself. The comparison is the exercise.
 *
 * The audio never leaves the browser — no upload, no storage, and the blob is
 * released when the card changes.
 */
export function Recorder({ onRecorded, targetSeconds }: {
  onRecorded?: () => void;
  /**
   * Seconds the answer is supposed to run for, shown as a clock while recording.
   *
   * The spoken part of the state examination is timed, and "aim for about ninety
   * seconds" printed above a microphone button is not a timing: nobody knows how
   * long they have been talking. The clock counts up rather than down, and going
   * past the target is not stopped or penalised, because the examiner does not
   * stop you either.
   */
  targetSeconds?: number;
}) {
  const [state, setState] = useState<State>("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (state !== "recording") return;
    const started = Date.now();
    setElapsed(0);
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [state]);

  const cleanup = useCallback(() => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  useEffect(() => () => {
    cleanup();
    if (url) URL.revokeObjectURL(url);
  }, [cleanup, url]);

  const start = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      const rec = new MediaRecorder(media);
      chunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType });
        if (url) URL.revokeObjectURL(url);
        setUrl(URL.createObjectURL(blob));
        setState("ready");
        cleanup();
        onRecorded?.();
      };
      recorder.current = rec;
      rec.start();
      setState("recording");
    } catch {
      // Permission refused, or no microphone. The exercise still works without it.
      setState("unavailable");
    }
  };

  const stop = () => recorder.current?.stop();

  if (state === "unavailable") {
    return (
      <p className="text-xs" style={{ color: "var(--ink-3)" }}>
        No microphone available, say it out loud anyway, then compare with the native voice.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {state === "recording" && (
        <span
          className="tnum text-sm font-semibold"
          style={{ color: targetSeconds && elapsed >= targetSeconds ? "var(--mint-ink)" : "var(--ink-2)" }}
          role="timer"
        >
          {clock(elapsed)}
          {targetSeconds ? <span style={{ color: "var(--ink-3)" }}> of {clock(targetSeconds)}</span> : null}
        </span>
      )}

      {state === "recording" ? (
        <button
          type="button"
          onClick={stop}
          className="press inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-ui hover:-translate-y-px"
          style={{ borderColor: "var(--again)", background: "var(--again-soft)", color: "var(--again-ink)" }}
        >
          <Square size={14} aria-hidden /> Stop
          <span className="ml-1 h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--again)" }} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void start()}
          className="press inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-ui hover:-translate-y-px"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-2)" }}
        >
          <Mic size={14} aria-hidden /> {url ? "Record again" : "Record yourself"}
        </button>
      )}

      {url && state !== "recording" && (
        <button
          type="button"
          onClick={() => { void new Audio(url).play(); }}
          className="press inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-ui hover:-translate-y-px"
          style={{ borderColor: "var(--rule)", background: "var(--raised)", color: "var(--ink-2)" }}
        >
          <Play size={14} aria-hidden /> Hear yourself
        </button>
      )}
    </div>
  );
}

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
