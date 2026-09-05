"use client";

import { useId, useState, useTransition } from "react";
import { BookOpen, Check, Loader2, Plus, X } from "lucide-react";
import { addToDeck } from "@/app/actions";
import { Button } from "@/components/Button";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Speak } from "@/components/Speak";
import type { GlossedToken } from "@/lib/dict/glossed";

/**
 * AN ATTESTED SENTENCE YOU CAN READ, RATHER THAN ONE YOU CAN ONLY LOOK AT.
 *
 * The word being taught is marked, exactly as it always was. What is new is
 * that every other word the dictionary vouches for is underlined and opens,
 * under the sentence, as the headword it belongs to, which form of it this is,
 * and what it means, with a way to keep it. See `lib/dict/glossed.ts` for what
 * is allowed to be underlined and why: this component draws what that module
 * decided and decides nothing itself.
 *
 * THE PANEL SITS UNDER THE SENTENCE RATHER THAN OVER THE WORD, and that is the
 * decision the rest of this follows from. A popover hung off an inline word in
 * a 360px card is the fault `test-containment.mjs` exists for, it covers the
 * sentence it is explaining, and it has to be dismissed before the next word
 * can be read. A panel below is the same width as the card at every size, and
 * a reader can run along the sentence with a pointer and watch it change.
 *
 * SO A POINTER LEAVING A WORD CLEARS NOTHING. Hovering picks a word, tapping
 * picks a word, focusing picks a word, and the panel then stays until another
 * word is picked or it is closed. If leaving cleared it, the mouse could never
 * reach the controls inside it, which is the half of this that a learner
 * actually presses.
 */
export function GlossedSentence({ tokens, sentence }: {
  tokens: GlossedToken[];
  /** The sentence as recorded, for the speaker. Joining the tokens gives the same string. */
  sentence: string;
}) {
  const panelId = useId();
  const [open, setOpen] = useState<number | null>(null);
  const chosen = open === null ? null : tokens[open] ?? null;

  return (
    <div className="w-full">
      <div className="flex items-start gap-2">
        <p lang="et" className="flex-1 text-lg font-semibold leading-snug" style={{ color: "var(--ink)" }}>
          {tokens.map((token, i) => {
            if (token.taught) {
              return (
                <mark key={i} className="bg-transparent font-bold" style={{ color: "var(--accent-deep)" }}>
                  {token.text}
                </mark>
              );
            }
            if (!token.entry) return <span key={i}>{token.text}</span>;
            const showing = open === i;
            return (
              <button
                key={i}
                type="button"
                /* An inline word in a sentence is deliberately not padded up to
                   the 44px floor: vertical padding on an inline box grows the
                   border box past the line rather than the line itself, which
                   is how a link ends up drawn outside the card it is in. WCAG
                   2.2 makes the same exception for the same reason. */
                className="rounded-sm underline underline-offset-4 transition-ui"
                /* The hover state is the open state, so there is no `hover:`
                   class here and there may not be one: an inline style beats a
                   class `:hover`, and a control painting its own resting
                   decoration inline can never define one. A pointer entering
                   the word opens it, which is what makes it solid. */
                style={{
                  /* The open word is a tint rather than a second purple. The
                     taught word is already `--accent-deep` two words away, and
                     two inks that close together read as one thing said twice:
                     what is showing is marked by being lifted off the line,
                     which is a different kind of object rather than a hue. */
                  color: "var(--ink)",
                  background: showing ? "var(--accent-soft)" : "transparent",
                  // Inline padding only, for the reason above.
                  paddingInline: "2px",
                  marginInline: "-2px",
                  textDecorationColor: showing ? "var(--accent-deep)" : "var(--accent)",
                  textDecorationStyle: showing ? "solid" : "dotted",
                }}
                /* The panel is a sibling rather than a child, so the word says
                   which region it opened: a screen reader following the button
                   otherwise lands on the sentence again. */
                aria-expanded={showing}
                aria-controls={panelId}
                onPointerEnter={(e) => { if (e.pointerType === "mouse") setOpen(i); }}
                onFocus={() => setOpen(i)}
                /* Always opens, never toggles. A mouse arriving on the word
                   has already opened it, so a click that toggled would close
                   the panel of the word the pointer is sitting on, which is
                   what happens the first time anybody hovers and then presses.
                   The panel is closed from the panel. */
                onClick={() => setOpen(i)}
              >
                {token.text}
              </button>
            );
          })}
        </p>
        <Speak text={sentence} label="Hear the sentence" />
      </div>

      <div id={panelId}>
        {chosen?.entry && (
          <WordPanel key={chosen.entry.lexemeId} entry={chosen.entry} onClose={() => setOpen(null)} />
        )}
      </div>
    </div>
  );
}

/**
 * One word out of the sentence, in English, with the thing somebody who did
 * not have it wants next.
 *
 * `matchedAs` is the whole reason this beats a gloss on its own: the sentence
 * says `kohvi` and the dictionary says `kohv`, and a learner who is not told
 * those are one word learns that they are two. It is only printed where the
 * spelling in front of them is not the headword.
 */
function WordPanel({ entry, onClose }: {
  entry: NonNullable<GlossedToken["entry"]>;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const add = () => {
    start(async () => {
      /*
        A press, never a render. Recognition and production both, which is what
        every other one-word add in this app offers: a word you can read and
        cannot say is half learned. It does not refresh the route, because the
        route behind this is a review session holding its own queue.
      */
      const r = await addToDeck(entry.lexemeId, ["RECOGNITION", "PRODUCTION"], "SENTENCE");
      setResult(r.ok ? (r.added === 0 ? "Already in your deck." : `Added ${r.added} cards.`) : r.error);
    });
  };

  return (
    <div
      className="mt-2.5 rounded-[var(--r)] border px-3 py-2.5 text-left"
      style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            {/* The headword is the link to its entry rather than a second
                button reading "Full entry": the card already has one of those
                for the word being taught, and two links with one name going to
                two places is a reader being told the same thing twice. */}
            <Link
              href={`/dictionary?q=${encodeURIComponent(entry.lemma)}`}
              lang="et"
              className="inline-flex items-baseline gap-1 text-base font-bold underline underline-offset-4"
              style={{ color: "var(--ink)", textDecorationColor: "var(--accent)" }}
            >
              {entry.lemma}
              <BookOpen size={12} aria-hidden />
            </Link>
            {entry.matchedAs && (
              <span className="text-2xs" style={{ color: "var(--ink-3)" }}>{entry.matchedAs}</span>
            )}
          </p>
          <p className="text-sm" style={{ color: "var(--ink-2)" }}>{entry.gloss}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close ${entry.lemma}`}
          className="tap-tint -mr-1 rounded-full p-1.5"
          style={{ color: "var(--ink-3)" }}
        >
          <X size={15} aria-hidden />
        </button>
      </div>
      <div className="mt-2">
        <Button size="sm" variant="soft" onClick={add} disabled={pending || result !== null}>
          {pending ? (
            <><Loader2 size={13} className="animate-spin" aria-hidden /> Adding…</>
          ) : result ? (
            <><Check size={13} aria-hidden /> {result}</>
          ) : (
            <><Plus size={13} aria-hidden /> Add to my deck</>
          )}
        </Button>
      </div>
      <span className="sr-only" role="status">{result ? `${entry.lemma}: ${result}` : ""}</span>
    </div>
  );
}
