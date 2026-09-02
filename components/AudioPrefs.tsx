"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_AUTOPLAY, DEFAULT_FEEDBACK_SOUNDS, DEFAULT_VOICE, type Autoplay, type FeedbackSounds } from "@/lib/audio/voice";
import { playFeedback, type Feedback } from "@/lib/audio/feedback";

/**
 * How this learner wants to hear things, published once by the signed-in
 * shell and read by every speaker button and every round inside it.
 *
 * A context rather than a prop threaded through forty components, and rather
 * than a `data-` attribute read off the document, because the values are
 * needed inside event handlers and effects where a hook is the natural
 * shape. The defaults are what a screen outside the shell gets, which is the
 * same voice and the same behaviour everybody had before this was a setting.
 */
export interface AudioPrefs {
  readonly voice: string;
  readonly autoplay: Autoplay;
  readonly sounds: FeedbackSounds;
}

const Context = createContext<AudioPrefs>({
  voice: DEFAULT_VOICE,
  autoplay: DEFAULT_AUTOPLAY,
  sounds: DEFAULT_FEEDBACK_SOUNDS,
});

export const useAudioPrefs = () => useContext(Context);

/** A right or wrong sound, if the learner wants them. Stable across renders. */
export function useFeedbackSound(): (kind: Feedback) => void {
  const { sounds } = useAudioPrefs();
  return sounds === "on" ? playFeedback : SILENT;
}

/** One function rather than one per render, so a caller's dependency list stays still. */
const SILENT = (): void => undefined;

export function AudioPrefsProvider({ value, children }: { value: AudioPrefs; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
