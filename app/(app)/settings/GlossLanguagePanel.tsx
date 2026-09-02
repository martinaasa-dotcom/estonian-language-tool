"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setGlossLanguage } from "@/app/actions";
import { ChoiceCard, ChoiceGroup } from "@/components/Choice";
import {
  GLOSS_LANGUAGES, type GlossLanguage,
} from "@/lib/collections/glossLanguage";

/**
 * Which language a meaning is given in.
 *
 * Each option is labelled in the language it names as well as in English,
 * because somebody who wants Russian is looking for `русский` rather than
 * reading down a list of English words for languages.
 */
export function GlossLanguagePanel({ current }: { current: GlossLanguage }) {
  const [value, setValue] = useState(current);
  const [pending, start] = useTransition();
  const router = useRouter();

  const pick = (next: GlossLanguage) => {
    setValue(next);
    start(async () => {
      await setGlossLanguage(next);
      router.refresh();
    });
  };

  return (
    <ChoiceGroup ariaLabel="Which language a meaning is given in" className="grid gap-2 sm:grid-cols-3">
      {GLOSS_LANGUAGES.map((option) => (
        <ChoiceCard
          key={option.id}
          layout="stacked"
          disabled={pending}
          selected={value === option.id}
          onSelect={() => pick(option.id)}
          title={option.label}
          detail={option.id === "en" ? "The course's own glosses" : option.native}
        />
      ))}
    </ChoiceGroup>
  );
}
