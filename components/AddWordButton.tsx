"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import { addToDeck } from "@/app/actions";
import { Button } from "@/components/Button";

/**
 * Puts one dictionary word into the deck.
 *
 * The same job `AddUnitButton` does for a whole unit, and the same argument for
 * saying what actually happened rather than flashing a tick: "already in your
 * deck" and "added 2 cards" are different outcomes, and somebody who clicks
 * twice has earned the right to know which one they got.
 *
 * Recognition and production both, which is what the dictionary's own add
 * button offers by default: a word you can read and cannot say is half learned.
 */
export function AddWordButton({ lexemeId, lemma, source = "DICTIONARY", className, variant = "secondary" }: {
  lexemeId: string;
  /** Named in the live region, so a screen reader hears which word landed. */
  lemma: string;
  source?: string;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const add = () => {
    start(async () => {
      const r = await addToDeck(lexemeId, ["RECOGNITION", "PRODUCTION"], source);
      if (!r.ok) {
        setResult(r.error);
        return;
      }
      setResult(r.added === 0 ? "Already in your deck." : `Added ${r.added} cards.`);
      router.refresh();
    });
  };

  return (
    <div className={className}>
      <Button variant={variant} onClick={add} disabled={pending || result !== null} className="w-full">
        {pending ? (
          <><Loader2 size={15} className="animate-spin" aria-hidden /> Adding…</>
        ) : result ? (
          <><Check size={15} aria-hidden /> {result}</>
        ) : (
          <><Plus size={15} aria-hidden /> Add it to my deck</>
        )}
      </Button>
      <span className="sr-only" role="status">{result ? `${lemma}: ${result}` : ""}</span>
    </div>
  );
}
