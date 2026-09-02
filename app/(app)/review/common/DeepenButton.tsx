"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/Button";
import { COMMON_BATCH } from "@/lib/collections/commonGroups";
import type { FrequencyGroup } from "@/lib/collections/frequency";
import { deepenCommonWords } from "@/app/actions";

/**
 * ONE PRESS, THE NEXT TWENTY WORDS OF A LIST, BUILT OUT PROPERLY.
 *
 * The round asks the words a learner already has cards for, so a list nobody
 * has added is a round with nothing in it. This is the way out of that, and it
 * is a button rather than something the page does on arrival for a reason
 * worth writing down: `PrefetchLink` fetches a whole page once a pointer has
 * settled on a link for 90ms, so a page that wrote cards while rendering would
 * build somebody a deck for hovering over it.
 *
 * It reports what happened in its own line rather than revalidating the list
 * out from under the cursor, which is the shape `/admin/suggestions` settled
 * on: a row that vanishes with no word about whether it worked is worse than
 * a slower one that says.
 */
export function DeepenButton({ group, label }: {
  group: FrequencyGroup;
  /** What the button says when there is work to do. */
  label?: string;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function add() {
    start(async () => {
      const result = await deepenCommonWords(group);
      if (!result.ok) { setNote(result.error); return; }
      setNote(result.added === 0
        ? "Every word on this list is already built out."
        : `${result.words} ${result.words === 1 ? "word" : "words"}, `
          + `${result.added} ${result.added === 1 ? "card" : "cards"}. Ready when you are.`);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="primary" onClick={add} disabled={pending}>
        <Plus size={15} aria-hidden />
        {pending ? "Adding" : label ?? `Add the next ${COMMON_BATCH}`}
      </Button>
      {note && (
        <p className="text-sm" style={{ color: "var(--ink-2)" }} role="status">{note}</p>
      )}
    </div>
  );
}
