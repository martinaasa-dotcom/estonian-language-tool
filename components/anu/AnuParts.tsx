"use client";

import { useTransition, useState, type ReactNode } from "react";
import { CheckCheck, Plus } from "lucide-react";
import { createLexeme, addToDeck } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Card, Chip } from "@/components/ui";
import { Mascot } from "@/components/brand";
import { SuggestFix } from "@/components/SuggestFix";
import type { Msg } from "./useAnuChat";
import { AI_TAG } from "@/lib/copy/values";
import { fixFrom, vocabFrom } from "@/lib/tutor/markers";
import { AnuProse } from "./Prose";

/**
 * The pieces of an Anu conversation shared by the full `/tutor` page and the
 * floating Anu button, so a bubble, a vocabulary suggestion or the provenance
 * line reads and behaves identically wherever the conversation is shown.
 */

/**
 * The starters, in two lengths, for the two shapes of room.
 *
 * One table, as before: a starter added here still arrives on the full page
 * and in the floating panel, and how one behaves cannot drift from the other.
 * What is per-surface is only how much of the label there is space for. At
 * 24rem the long ones wrapped to three rows of pills under a greeting card and
 * a bordered button, which was most of what a learner met on opening Anu; the
 * page has the width to be more inviting. `EVIDENCE_NOTE` and `EVIDENCE_LABEL`
 * are the same pairing for the same reason.
 */
export const CHIPS = [
  { label: "Break this sentence down", short: "Break it down", prompt: "Break this Estonian sentence down piece by piece, labelling each case: " },
  { label: "Which case, and why?", short: "Which case?", prompt: "Which case should I use here, and what is the rule? " },
  { label: "Object case check", short: "Object case", prompt: "Is the object case right in this sentence, total or partial? Explain why: " },
  { label: "Explain this gradation", short: "Gradation", prompt: "Explain the consonant gradation in this word and name the pattern: " },
  { label: "Correct my Estonian", short: "Correct me", prompt: "Correct my Estonian and explain each change: " },
  { label: "Quiz me", short: "Quiz me", prompt: "Quiz me with five short Estonian questions at my level, one at a time." },
] as const;

/**
 * The instruction behind "Check a sentence".
 *
 * Written out rather than left to the learner to phrase, because the phrasing
 * is what makes the answer useful: name the rule before the fix, and admit
 * uncertainty instead of inventing a form. The corrected sentence is asked for
 * on its own `FIX:` line so the UI can mark it as the model's work rather than
 * letting it pass for dictionary data — Anu's Estonian is never stored as a
 * form (ADR-005); the dictionary's is.
 */
export function sentenceCheckPrompt(estonian: string, meaning: string): string {
  return [
    "Check this sentence for me.",
    "",
    `Estonian: "${estonian.trim()}"`,
    meaning.trim() ? `What I meant: "${meaning.trim()}"` : "",
    "",
    "Please:",
    "1. Say plainly whether it is correct.",
    "2. For each mistake, name the rule first, which case and why, the gradation pattern, the verb's government, or the word order, and only then the fix.",
    "3. Put the corrected sentence on its own final line, starting with FIX:",
    "4. If you are not certain of a form, say so and tell me which word to look up in the dictionary rather than guessing.",
  ].filter(Boolean).join("\n");
}

/**
 * Where the answer came from.
 *
 * The repo already renders provenance on every form the dictionary shows,
 * because a learner has to be able to tell a lexicographer's Estonian from a
 * model's. This is the same question asked of the chat, and the honest answer
 * has two states rather than one. Before a reply, all this can say is which
 * provider the deployment would ask. After one, it names the model that
 * actually wrote what is on screen, read off the reply's own headers, which
 * with a fallback chain configured is not always the same thing.
 *
 * `compact` is the floating panel, and it keeps only the half that is a fact
 * about something on screen. Three things were being said in one grey block
 * under the box a learner types into: where Estonian forms come from, which is
 * a standing fact about Anu rather than about any answer; which provider the
 * deployment *would* ask, which is a prediction about a reply that does not
 * exist yet; and which model actually wrote what is on screen. Only the last
 * is a fact about the answer, and it is the only one a 24rem panel has room
 * for. So the standing fact is said once, in the line under her name in the
 * panel's header, and the prediction is not made at all: "Will ask OpenRouter
 * · google/gemma-4-31b-it:free." was the largest thing on the panel a learner
 * had not asked anything yet, and it named a model that had answered nothing.
 *
 * Nothing is softened by dropping it. What makes Anu's Estonian checkable is
 * that each piece of it is boxed and tagged in the reply itself, and the full
 * `/tutor` page, which has the room, still says all three.
 */
export function Provenance({ label, answered, compact = false }: {
  label: string | null;
  answered: boolean;
  compact?: boolean;
}) {
  if (!label) return null;
  if (compact && !answered) return null;
  return (
    <p className="text-2xs leading-relaxed" style={{ color: "var(--ink-3)" }}>
      {answered ? "Answered by" : "Will ask"} {label}.
      {!compact && " Anu explains grammar. Every form in the dictionary comes from Ekilex, never from a model."}
    </p>
  );
}

/**
 * The half-written questions, offered as a way in.
 *
 * One row rather than the two that were here: the page drew it at one size and
 * the panel at another, from the same table, so a starter added to `CHIPS`
 * arrived in both and any change to how one behaves arrived in neither. Picking
 * one writes it into the box and puts the learner in the box, which is the part
 * that was missing: on the panel the starters and the field are now at opposite
 * ends of the screen, and a chip that silently fills something you are not
 * looking at reads as a chip that did nothing.
 *
 * `lead` is how "Check a sentence I wrote" joins the row rather than sitting
 * above it in a bordered pill of its own. It is the same kind of offer as the
 * six beside it, so on the narrow surface it is one of them, drawn a little
 * heavier because it is the one worth pressing first. The transparent border on
 * every chip is what keeps that row an even height.
 */
export function Starters({ compact = false, lead, onPick }: {
  compact?: boolean;
  lead?: ReactNode;
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {lead}
      {CHIPS.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onPick(c.prompt)}
          className={`press rounded-full border border-transparent font-semibold transition-ui hover:-translate-y-px ${
            compact ? "px-3 py-1.5 text-2xs" : "px-3.5 py-2 text-xs"
          }`}
          style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
        >
          {compact ? c.short : c.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The way out when Anu could not answer.
 *
 * Both surfaces show the failure inside the conversation, because that is
 * where the learner is looking. Neither may put a control there: a message is
 * sent back to the model as context next time, and a button inside one is a
 * button inside a transcript. So the offer to tell somebody sits under the
 * thread, and only once something has actually failed.
 */
export function AnuFailure({ failure }: { failure: string | null }) {
  if (!failure) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm" style={{ color: "var(--ink-3)" }}>Keeps happening?</p>
      <SuggestFix
        category="BROKEN"
        trigger={`Asking Anu failed: ${failure}`}
        label="Tell the Kodukeel team"
      />
    </div>
  );
}

/**
 * What a "check this sentence" message should look like once sent.
 *
 * The prompt carries four numbered instructions so the answer is worth reading;
 * the learner typed one sentence. Showing them the scaffolding back makes the
 * conversation unreadable, so the bubble shows what they actually wrote. The
 * full text is still what was sent, and still what is stored.
 */
function displayUserContent(content: string): string {
  if (!content.startsWith("Check this sentence for me.")) return content;
  const estonian = /^Estonian: "(.*)"$/m.exec(content)?.[1];
  const meaning = /^What I meant: "(.*)"$/m.exec(content)?.[1];
  if (!estonian) return content;
  return meaning ? `${estonian}\n\n(${meaning})` : estonian;
}

export function Bubble({ message, streaming }: { message: Msg; streaming: boolean }) {
  const isUser = message.role === "user";
  const { body: withoutVocab, vocab } = splitVocab(message.content);
  const { body, unverified } = splitUnverified(withoutVocab);
  const { rest, fix } = splitFix(isUser ? displayUserContent(body) : body);
  /*
    Nothing has arrived yet, and the reply is being held until it has.

    `useAnuChat` shows a reply once, finished, rather than a word at a time,
    so while it is on its way the bubble is the fact that Anu is writing and
    nothing else. Drawn as her bubble rather than as a spinner in the input
    row, because the place a learner is looking for the answer is where the
    answer is going to appear.
  */
  const writing = !isUser && streaming && rest === "" && !fix;

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      {!isUser && <Mascot size={34} className="mt-1 shrink-0" animate={false} />}
      <div
        className="rounded-[var(--r-lg)] border px-4 py-3.5"
        style={{
          borderColor: isUser ? "transparent" : "var(--rule)",
          background: isUser ? "var(--accent-soft)" : "var(--surface)",
          boxShadow: isUser ? "none" : "var(--shadow-sm)",
          borderBottomRightRadius: isUser ? 8 : undefined,
          borderBottomLeftRadius: isUser ? undefined : 8,
          maxWidth: isUser ? "85%" : "100%",
        }}
      >
        <p className="label-xs mb-1.5" style={{ color: isUser ? "var(--accent-deep)" : "var(--blush-ink)" }}>
          {isUser
            ? message.content.startsWith("Check this sentence for me.") ? "You · sentence to check" : "You"
            : "Anu"}
        </p>
        {writing ? (
          <Writing />
        ) : isUser ? (
          <div className="whitespace-pre-wrap text-base leading-relaxed" style={{ color: "var(--ink)" }}>{rest}</div>
        ) : (
          <AnuProse text={rest} />
        )}
        {fix && (
          <div className="mt-3 rounded-[var(--r)] px-4 py-3" style={{ background: "var(--accent-soft)" }}>
            <div className="mb-1 flex items-center gap-2">
              <span className="label-xs" style={{ color: "var(--accent-deep)" }}>Corrected</span>
              <Chip tone="again" title="Anu wrote this, it isn't a dictionary form.">
                {AI_TAG}
              </Chip>
            </div>
            <p lang="et" className="text-md" style={{ color: "var(--ink)" }}>{fix}</p>
          </div>
        )}
        {unverified.length > 0 && <UnverifiedNotice words={unverified} />}
        {vocab.length > 0 && <VocabBridge vocab={vocab} />}
      </div>
    </div>
  );
}

/**
 * Three dots, in turn, and a sentence for anybody who cannot see them.
 *
 * The bubble is in a live region, so the sentence is announced once when the
 * reply is asked for and the finished reply is announced when it lands, which
 * is two announcements rather than one per word.
 */
function Writing() {
  return (
    <div className="flex h-6 items-center gap-1" aria-label="Anu is writing" role="status">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="inline-block h-1.5 w-1.5 animate-pulse rounded-full"
          style={{ background: "var(--ink-3)", animationDelay: `${i * 180}ms` }}
        />
      ))}
      <span className="sr-only">Anu is writing</span>
    </div>
  );
}

/**
 * Pulls the trailing VOCAB: lines out of the reply so they can become cards.
 *
 * The line's shape is `lib/tutor/markers.ts`'s, which is what lets a model
 * write `**VOCAB:**` and still have the pair parse: the bold is typography
 * round the marker, and the payload is read with it lifted off.
 */
function splitVocab(content: string): { body: string; vocab: { et: string; en: string }[] } {
  const vocab: { et: string; en: string }[] = [];
  const body: string[] = [];

  for (const line of content.split("\n")) {
    const pair = vocabFrom(line);
    if (pair) vocab.push(pair);
    else body.push(line);
  }
  return { body: body.join("\n").trim(), vocab };
}

/**
 * Pulls the trailing UNVERIFIED: line out of the reply.
 *
 * `app/api/tutor/route.ts` appends this itself, after streaming ends, once it
 * has checked Anu's own prose (never a FIX: or VOCAB: line, both already
 * boxed and tagged below) against the dictionary the way a scanned word is
 * checked (ADR-021). It cannot withhold what has already streamed to the
 * screen, so this is the honest alternative: name exactly which word was not
 * one the dictionary could confirm.
 */
function splitUnverified(content: string): { body: string; unverified: string[] } {
  const lines = content.split("\n");
  const unverified: string[] = [];
  const body: string[] = [];

  for (const line of lines) {
    const match = /^UNVERIFIED:\s*(.+)$/.exec(line.trim());
    if (match?.[1]) unverified.push(...match[1].split(",").map((w) => w.trim()).filter(Boolean));
    else body.push(line);
  }
  return { body: body.join("\n").trim(), unverified };
}

function UnverifiedNotice({ words }: { words: string[] }) {
  const plural = words.length > 1;
  return (
    <div
      className="mt-3 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 rounded-[var(--r)] px-4 py-3 text-sm"
      style={{ background: "var(--again-soft)", color: "var(--again-ink)" }}
    >
      <Chip tone="again" title="Not a stored form, so the dictionary could not confirm it">
        {AI_TAG}
      </Chip>
      <span>{plural ? "Anu used words above" : "Anu used a word above"} the dictionary does not recognise yet:</span>
      <span>
        {words.map((w, i) => (
          <span key={w}>
            {i > 0 && ", "}
            <span lang="et" className="font-semibold">{w}</span>
          </span>
        ))}.
      </span>
      <span>Check {plural ? "them" : "it"} before you trust {plural ? "them" : "it"}.</span>
    </div>
  );
}

/**
 * Pulls the corrected sentence out, so it can be shown as the model's own work.
 *
 * The point is the label, not the layout: a learner reading a paragraph of
 * grammar has no way to tell which of the Estonian in it came from a
 * lexicographer and which from a language model. Here, one of them is boxed and
 * tagged.
 */
function splitFix(content: string): { rest: string; fix: string | null } {
  // Models number their answers and, once allowed bold, bold their markers,
  // so the line arrives as "3. FIX:" or "**FIX:**" as often as "FIX:".
  // `fixFrom` knows every shape; matching only the bare form left the
  // corrected sentence buried in the paragraph, unlabelled, which is the one
  // thing this box exists to fix.
  const lines = content.split("\n");
  const index = lines.findIndex((l) => fixFrom(l) !== null);
  if (index === -1) return { rest: content, fix: null };
  const fix = fixFrom(lines[index]!);
  return {
    rest: [...lines.slice(0, index), ...lines.slice(index + 1)].join("\n").trim(),
    fix: fix || null,
  };
}

/**
 * The way into "check a sentence", drawn once.
 *
 * The panel puts it at the head of the starter row rather than in a bordered
 * pill on a line of its own, so it is defined here rather than inside
 * `SentenceCheck`: two copies of one button is how the page and the panel drift
 * apart a padding at a time. Heavier than the six beside it, by a border and by
 * the icon, because it is the one worth pressing first; not a second solid
 * accent, because the panel already has one loud action and that is the Ask
 * button under the box.
 */
export function CheckStarter({ compact = false, onOpen }: { compact?: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`press flex items-center gap-1.5 self-start rounded-full border font-semibold transition-ui hover:-translate-y-px ${
        compact ? "px-3 py-1.5 text-2xs" : "px-4 py-2 text-sm"
      }`}
      style={{ borderColor: "var(--accent)", color: "var(--accent-deep)", background: "var(--accent-soft)" }}
    >
      <CheckCheck size={compact ? 13 : 15} aria-hidden />
      {compact ? "Check a sentence" : "Check a sentence I wrote"}
    </button>
  );
}

export function SentenceCheck({
  open, estonian, meaning, streaming, compact = false, onOpen, onClose, onEstonian, onMeaning, onSubmit,
}: {
  open: boolean;
  estonian: string;
  meaning: string;
  streaming: boolean;
  compact?: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEstonian: (value: string) => void;
  onMeaning: (value: string) => void;
  onSubmit: () => void;
}) {
  if (!open) return <CheckStarter compact={compact} onOpen={onOpen} />;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="label-xs" style={{ color: "var(--ink-3)" }}>Check a sentence</span>
        <button type="button" onClick={onClose} className="text-xs" style={{ color: "var(--ink-3)" }}>
          Close
        </button>
      </div>
      <EstonianInput
        value={estonian}
        onChange={onEstonian}
        placeholder="Ma lugesin raamatu eile õhtul."
        ariaLabel="The Estonian sentence you wrote"
        autoFocus
      />
      <input
        value={meaning}
        onChange={(e) => onMeaning(e.target.value)}
        placeholder="What you meant, in English (optional but it helps)"
        aria-label="What you meant, in English"
        className="mt-2 w-full rounded-md border px-3.5 py-2.5 text-base"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
      />
      {/*
        `shrink-0` because a flex item shrinks below its content by default, and
        this row is a button beside a sentence. At 22rem inside the floating
        panel the button was squeezed to the width of one character and drew
        "Check it" down the screen a letter per line, which is a fault inside a
        card that is itself the right size, so nothing measuring the document
        could see it. The note goes entirely on the narrow surface rather than
        wrapping to four lines: it says what the line under her name in the
        panel's header already says, and saying it twice on one small screen is
        how a panel comes to read as busy.
      */}
      <div className="mt-3 flex items-center gap-3">
        <Button
          variant="primary"
          className="shrink-0"
          onClick={onSubmit}
          disabled={streaming || estonian.trim().length < 3}
        >
          <CheckCheck size={15} aria-hidden /> Check it
        </Button>
        {!compact && (
          <span className="text-xs" style={{ color: "var(--ink-3)" }}>
            Anu names the rule before the fix, and says so when she is unsure rather than guessing.
          </span>
        )}
      </div>
    </Card>
  );
}

function VocabBridge({ vocab }: { vocab: { et: string; en: string }[] }) {
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();

  const add = (word: { et: string; en: string }) => {
    start(async () => {
      const created = await createLexeme({
        // The provenance carries "a model suggested this and nobody has checked
        // it", which is what `AI · verify` is drawn from. It used to be a
        // sentence in `notes`, where nothing read it.
        lemma: word.et, translation: word.en, pos: "OTHER",
      });
      if (created.ok) {
        await addToDeck(created.id, ["RECOGNITION", "PRODUCTION"], "TUTOR");
        setAdded((s) => new Set(s).add(word.et));
      }
    });
  };

  return (
    <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--rule-soft)" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="label-xs" style={{ color: "var(--ink-3)" }}>Vocabulary</span>
        <Chip tone="again" title="Anu's forms haven't been checked. Look them up in the dictionary to be sure.">
          {AI_TAG}
        </Chip>
      </div>
      <ul className="flex flex-col gap-1.5">
        {vocab.map((w) => (
          <li key={w.et} className="flex items-center justify-between gap-3">
            <span className="text-sm">
              <span className="font-semibold" style={{ color: "var(--ink)" }}>{w.et}</span>
              <span style={{ color: "var(--ink-3)" }}>, {w.en}</span>
            </span>
            <Button
              variant="ghost"
              disabled={pending || added.has(w.et)}
              onClick={() => add(w)}
              aria-label={`Add "${w.et}" to your deck`}
            >
              {added.has(w.et) ? "Added" : <><Plus size={14} aria-hidden /> Add</>}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
