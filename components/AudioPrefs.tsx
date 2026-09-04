"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_AUTOPLAY, DEFAULT_FEEDBACK_SOUNDS, DEFAULT_VOICE, type Autoplay, type FeedbackSounds } from "@/lib/audio/voice";
import { playFeedback, type Feedback } from "@/lib/audio/feedback";
import { DEFAULT_HEARING, type Hearing } from "@/lib/audio/conditions";

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
  /** Whether the listening rounds vary the room and the rate. */
  readonly hearing: Hearing;
}

const Context = createContext<AudioPrefs>({
  voice: DEFAULT_VOICE,
  autoplay: DEFAULT_AUTOPLAY,
  sounds: DEFAULT_FEEDBACK_SOUNDS,
  hearing: DEFAULT_HEARING,
});

export const useAudioPrefs = () => useContext(Context);

/**
 * A right or wrong sound, if the learner wants them. Stable across renders.
 *
 * The second argument is how many right answers are in a row, counting this
 * one, which the right sound climbs with. Optional, so a caller that is not
 * counting keeps the sound the app has always made.
 */
export function useFeedbackSound(): (kind: Feedback, streak?: number) => void {
  const { sounds } = useAudioPrefs();
  return sounds === "on" ? playFeedback : SILENT;
}

/** One function rather than one per render, so a caller's dependency list stays still. */
const SILENT = (): void => undefined;

export function AudioPrefsProvider({ value, children }: { value: AudioPrefs; children: ReactNode }) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
