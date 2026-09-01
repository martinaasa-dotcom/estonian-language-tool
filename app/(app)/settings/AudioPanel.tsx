"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ear, EarOff, Music, VolumeX } from "lucide-react";
import { setAutoplay, setFeedbackSounds, setVoice } from "@/app/actions";
import { ChoiceCard, ChoiceChip, ChoiceGroup } from "@/components/Choice";
import { Speak } from "@/components/Speak";
import { playFeedback } from "@/lib/audio/feedback";
import { type Autoplay, type FeedbackSounds, VOICES } from "@/lib/audio/voice";

/**
 * The voice, and whether it speaks unasked.
 *
 * A speaker button beside each name rather than a description of the voice,
 * because "warm" and "clear" are the sort of words a brochure uses about a
 * voice and the only thing that tells two voices apart is hearing them. The
 * sample is the app's own name, which every voice can say and which is the
 * one word a learner already knows how it should sound.
 */
const SAMPLE = "Kodukeel. Tere tulemast!";

export function VoicePanel({ current }: { current: string }) {
  const [voice, setVoiceState] = useState(current);
  const [pending, start] = useTransition();
  const router = useRouter();

  const pick = (next: string) => {
    setVoiceState(next);
    start(async () => {
      await setVoice(next);
      router.refresh();
    });
  };

  return (
    <ChoiceGroup ariaLabel="Which voice reads Estonian" className="flex flex-wrap gap-2">
      {VOICES.map((v) => (
        <span key={v.id} className="inline-flex items-center gap-1">
          <ChoiceChip selected={voice === v.id} disabled={pending} onSelect={() => pick(v.id)}>
            {v.name}
          </ChoiceChip>
          <VoiceSample voice={v.id} name={v.name} />
        </span>
      ))}
    </ChoiceGroup>
  );
}

/**
 * Hears one voice without changing the setting. `Speak` reads the voice off
 * the shell's context, so a sample of a *different* voice has to ask for it
 * by name; the request shape is the same one the route already validates.
 */
function VoiceSample({ voice, name }: { voice: string; name: string }) {
  const [state, setState] = useState<"idle" | "loading" | "gone">("idle");
  if (state === "gone") return null;
  const play = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: SAMPLE, speed: 1, voice }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
      await audio.play();
      setState("idle");
    } catch {
      setState("gone");
    }
  };
  return (
    <button
      type="button"
      onClick={() => void play()}
      disabled={state === "loading"}
      aria-label={`Hear ${name}`}
      className="press tap-tint inline-flex h-8 w-8 items-center justify-center rounded-full"
      style={{ color: "var(--ink-3)" }}
    >
      <Ear size={14} aria-hidden />
    </button>
  );
}

const AUTOPLAY: { value: Autoplay; label: string; detail: string; icon: typeof Ear }[] = [
  {
    value: "on",
    label: "Read each card aloud",
    detail: "A word is spoken the moment you meet it and the moment its answer appears. The speaker button still works.",
    icon: Ear,
  },
  {
    value: "off",
    label: "Only when I press play",
    detail: "For a library or a bus. Nothing plays until you ask for it.",
    icon: EarOff,
  },
];

export function AutoplayPanel({ current }: { current: Autoplay }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const router = useRouter();

  const pick = (next: Autoplay) => {
    setValue(next);
    start(async () => {
      await setAutoplay(next);
      router.refresh();
    });
  };

  return (
    <ChoiceGroup ariaLabel="When Estonian is read aloud" className="grid gap-2 sm:grid-cols-2">
      {AUTOPLAY.map((o) => (
        <ChoiceCard
          key={o.value}
          layout="stacked"
          disabled={pending}
          selected={value === o.value}
          onSelect={() => pick(o.value)}
          icon={<o.icon size={16} aria-hidden />}
          title={o.label}
          detail={o.detail}
        />
      ))}
    </ChoiceGroup>
  );
}

const SOUNDS: { value: FeedbackSounds; label: string; detail: string; icon: typeof Music }[] = [
  {
    value: "on",
    label: "A sound for right and wrong",
    detail: "Two quiet notes for a hit, one low one for a miss, before the correction is read.",
    icon: Music,
  },
  {
    value: "off",
    label: "Silent",
    detail: "The colour and the words carry the verdict on their own.",
    icon: VolumeX,
  },
];

export function FeedbackSoundsPanel({ current }: { current: FeedbackSounds }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const router = useRouter();

  const pick = (next: FeedbackSounds) => {
    setValue(next);
    // Play the sound being chosen, so the choice can be heard rather than read about.
    if (next === "on") playFeedback("right");
    start(async () => {
      await setFeedbackSounds(next);
      router.refresh();
    });
  };

  return (
    <ChoiceGroup ariaLabel="Whether answers make a sound" className="grid gap-2 sm:grid-cols-2">
      {SOUNDS.map((o) => (
        <ChoiceCard
          key={o.value}
          layout="stacked"
          disabled={pending}
          selected={value === o.value}
          onSelect={() => pick(o.value)}
          icon={<o.icon size={16} aria-hidden />}
          title={o.label}
          detail={o.detail}
        />
      ))}
    </ChoiceGroup>
  );
}

/** A speaker for the sample line in the learner's own current voice. */
export function CurrentVoiceSample() {
  return <Speak text={SAMPLE} label="Hear the voice you have chosen" />;
}
