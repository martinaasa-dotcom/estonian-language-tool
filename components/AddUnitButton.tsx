"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import { addUnitToDeck } from "@/app/actions";
import { Button } from "@/components/Button";

/**
 * Adds a whole path unit to the deck.
 *
 * Reports what actually happened rather than flashing a generic tick: "already
 * in your deck" and "added 34 cards" are different outcomes, and a learner who
 * clicks twice deserves to know which one they got.
 */
export function AddUnitButton({ unitId, words, started, className, variant = "primary" }: {
  unitId: string;
  words: number;
  /** True when some of the unit is already in the deck — changes the wording. */
  started: boolean;
  className?: string;
  variant?: "primary" | "secondary";
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const add = () => {
    start(async () => {
      const r = await addUnitToDeck(unitId);
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
      <Button variant={variant} onClick={add} disabled={pending} className="w-full">
        {pending ? (
          <><Loader2 size={15} className="animate-spin" aria-hidden /> Adding…</>
        ) : result ? (
          <><Check size={15} aria-hidden /> {result}</>
        ) : (
          <><Plus size={15} aria-hidden /> {started ? "Add the rest" : `Add ${words} words`}</>
        )}
      </Button>
      <span className="sr-only" role="status">{result ?? ""}</span>
    </div>
  );
}
