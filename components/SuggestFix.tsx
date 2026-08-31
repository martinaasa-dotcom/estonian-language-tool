"use client";

import { useState, useTransition } from "react";
import { Check, MessageSquareWarning, X } from "lucide-react";
import { submitSuggestion } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import {
  PATCH_POS, SUGGESTION_CATEGORIES, SUGGESTION_LIMITS,
  type Patch, type SuggestionCategory,
} from "@/lib/suggestions/model";

/**
 * The way out of a dead end.
 *
 * THE RULE THIS COMPONENT EXISTS FOR: nothing in this app is allowed to tell
 * somebody it cannot help them and then stop. A search that found nothing, an
 * answer marked wrong that was right, a word on their own homework the
 * dictionary would not vouch for, a screen that threw — every one of those
 * used to end in a sentence and a back button, and the person who knew what
 * was actually wrong was the one person with nowhere to put it.
 *
 * So it is mounted beside the failure rather than filed under a "contact us"
 * page. Three things follow from that and they are what make it worth having:
 *
 * - **It carries the failure with it.** The screen, and what the app had just
 *   said, go with the report. A reviewer reading "kohv is wrong" learns
 *   nothing; reading it under `/review` beside "we asked for the partitive and
 *   marked kohvi wrong" learns everything.
 * - **The note is optional.** Somebody annoyed enough to press this has
 *   already given us the useful half by pressing it on that screen. A form
 *   that will not send without a paragraph collects nothing from exactly the
 *   people worth hearing from.
 * - **It says what happens next.** Not "thanks for your feedback": where it
 *   went, that a person reads it, and whether accepting it changes the
 *   dictionary for everybody.
 *
 * The Estonian fields are `EstonianInput`, so somebody proposing a correct
 * form can actually type õ without knowing an alt code. Every Estonian
 * character that ends up in the dictionary through this path was typed by a
 * person, which is the same standard the hand-edit path meets (ADR-005).
 */
/**
 * The screen the report came from, read at send time rather than from the
 * router.
 *
 * `useSearchParams` would be the tidier way to get the query, and it is not
 * available to this component: it is mounted on `not-found` and on the error
 * boundary, which are prerendered, and a hook that opts a page out of static
 * rendering fails the build there. Reading `location` inside the click is the
 * same answer with no such condition, and this only ever runs in a browser.
 */
function whereWeAre(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

export function SuggestFix({
  category,
  categories,
  lemma,
  lexemeId,
  trigger,
  currentTranslation,
  formTypes,
  examples,
  label,
  tone = "quiet",
}: {
  /** What is wrong, as the app already knows it. Preselected in the form. */
  category: SuggestionCategory;
  /** Offered alternatives, when the learner is better placed to say which. */
  categories?: SuggestionCategory[];
  lemma?: string | null;
  lexemeId?: string | null;
  /** What the app had just told them. Sent with the report, and shown here. */
  trigger?: string | null;
  /** The gloss on screen, so a correction starts from what they are looking at. */
  currentTranslation?: string | null;
  /** The principal parts this entry has, for a "that form is wrong" report. */
  formTypes?: { formType: string; label: string; value: string }[];
  /** The example sentences on screen, for a "that sentence is unhelpful" report. */
  examples?: string[];
  label?: string;
  /** `loud` where the failure is the whole screen and this is the way on. */
  tone?: "quiet" | "loud";
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SuggestionCategory>(category);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // The proposal fields. Which of them is shown is decided by `kind`, so
  // changing the category changes the question rather than the form.
  const [word, setWord] = useState(lemma ?? "");
  const [pos, setPos] = useState<string>("NOUN");
  const [meaning, setMeaning] = useState(currentTranslation ?? "");
  const [formType, setFormType] = useState(formTypes?.[0]?.formType ?? "");
  const [formValue, setFormValue] = useState(formTypes?.[0]?.value ?? "");
  const [sentence, setSentence] = useState(examples?.[0] ?? "");

  const choices = categories && categories.length > 1 ? categories : null;

  const patch = (): Patch | null => {
    if (kind === "MISSING_WORD" && word.trim() && meaning.trim()) {
      return { kind: "CREATE_WORD", lemma: word.trim(), pos, translation: meaning.trim(), forms: {} };
    }
    if (kind === "WRONG_MEANING" && lexemeId && meaning.trim() && meaning.trim() !== (currentTranslation ?? "").trim()) {
      return { kind: "SET_TRANSLATION", lexemeId, translation: meaning.trim() };
    }
    if (kind === "WRONG_FORM" && lexemeId && formType && formValue.trim()) {
      return { kind: "SET_FORM", lexemeId, formType, value: formValue.trim() };
    }
    if (kind === "WRONG_EXAMPLE" && lexemeId && sentence.trim()) {
      return { kind: "DROP_EXAMPLE", lexemeId, sentence: sentence.trim() };
    }
    return null;
  };

  const send = () => {
    setError(null);
    start(async () => {
      /*
        Wrapped, because of where this component is mounted. It sits on the
        error boundary and on the not-found page, which are the two screens
        that render when something has already gone wrong, and one of the
        things that can have gone wrong is the session. A rejected action
        inside a transition throws to the nearest error boundary, so on the
        error boundary itself it would replace one failure with a worse one.
      */
      try {
        const result = await submitSuggestion({
          category: kind,
          note,
          lemma: lemma ?? (kind === "MISSING_WORD" ? word : undefined),
          lexemeId: lexemeId ?? undefined,
          context: whereWeAre(),
          trigger: trigger ?? undefined,
          patch: patch() ?? undefined,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSent(result.message);
      } catch {
        setError(
          "That did not reach us. If you are offline it will need sending again once you are back; " +
          "if you have been signed out, signing in again is the fix.",
        );
      }
    });
  };

  if (sent) {
    return (
      <p
        className="flex items-start gap-2 rounded-[var(--r)] px-4 py-3 text-sm"
        style={{ background: "var(--good-soft)", color: "var(--good-ink)" }}
      >
        <Check size={15} aria-hidden className="mt-0.5 shrink-0" />
        <span>{sent}</span>
      </p>
    );
  }

  if (!open) {
    return (
      <Button
        variant={tone === "loud" ? "secondary" : "ghost"}
        size={tone === "loud" ? "md" : "sm"}
        onClick={() => setOpen(true)}
      >
        <MessageSquareWarning size={15} aria-hidden />
        {label ?? "Suggest a fix"}
      </Button>
    );
  }

  return (
    <div
      className="w-full rounded-[var(--r-lg)] border p-5 text-left"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold" style={{ color: "var(--ink)" }}>
            Tell the Kodukeel team
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {SUGGESTION_CATEGORIES[kind].lead}
          </p>
        </div>
        <Button variant="ghost" size="sm" aria-label="Close" onClick={() => setOpen(false)}>
          <X size={15} aria-hidden />
        </Button>
      </div>

      {trigger && (
        <p
          className="mt-3 rounded-[var(--r)] px-3 py-2 text-xs"
          style={{ background: "var(--raised)", color: "var(--ink-3)" }}
        >
          Sent with this: {trigger}
        </p>
      )}

      {choices && (
        <div className="mt-4">
          <label htmlFor="suggest-kind" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
            What kind of problem
          </label>
          <select
            id="suggest-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as SuggestionCategory)}
            className="w-full rounded-[var(--r)] border px-3 py-2.5 text-sm"
            style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
          >
            {choices.map((c) => (
              <option key={c} value={c}>{SUGGESTION_CATEGORIES[c].label}</option>
            ))}
          </select>
        </div>
      )}

      {kind === "MISSING_WORD" && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="suggest-word" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
              The Estonian word
            </label>
            <EstonianInput id="suggest-word" value={word} onChange={setWord} ariaLabel="The Estonian word" />
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1">
              <label htmlFor="suggest-meaning" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
                What it means in English
              </label>
              <input
                id="suggest-meaning"
                value={meaning}
                onChange={(e) => setMeaning(e.target.value)}
                className="w-full rounded-[var(--r)] border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
              />
            </div>
            <div>
              <label htmlFor="suggest-pos" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
                Kind of word
              </label>
              <select
                id="suggest-pos"
                value={pos}
                onChange={(e) => setPos(e.target.value)}
                className="rounded-[var(--r)] border px-3 py-2.5 text-sm"
                style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
              >
                {PATCH_POS.map((p) => (
                  <option key={p} value={p}>{p.toLowerCase()}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {kind === "WRONG_MEANING" && (
        <div className="mt-4">
          <label htmlFor="suggest-gloss" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
            What it should say in English
          </label>
          <input
            id="suggest-gloss"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            className="w-full rounded-[var(--r)] border px-3 py-2.5 text-sm"
            style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
          />
          <p className="mt-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
            Leave it as it is if you are sure it is wrong but not sure what is right. That is still
            worth telling us.
          </p>
        </div>
      )}

      {kind === "WRONG_FORM" && formTypes && formTypes.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label htmlFor="suggest-formtype" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
              Which form
            </label>
            <select
              id="suggest-formtype"
              value={formType}
              onChange={(e) => {
                setFormType(e.target.value);
                setFormValue(formTypes.find((f) => f.formType === e.target.value)?.value ?? "");
              }}
              className="w-full rounded-[var(--r)] border px-3 py-2.5 text-sm"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
            >
              {formTypes.map((f) => (
                <option key={f.formType} value={f.formType}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="suggest-form" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
              What it should be
            </label>
            <EstonianInput id="suggest-form" value={formValue} onChange={setFormValue} ariaLabel="The correct form" />
          </div>
        </div>
      )}

      {kind === "WRONG_EXAMPLE" && examples && examples.length > 0 && (
        <div className="mt-4">
          <label htmlFor="suggest-sentence" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
            Which sentence
          </label>
          <select
            id="suggest-sentence"
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            lang="et"
            className="w-full rounded-[var(--r)] border px-3 py-2.5 text-sm"
            style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
          >
            {examples.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      <div className="mt-4">
        <label htmlFor="suggest-note" className="label-xs mb-2 block" style={{ color: "var(--ink-3)" }}>
          Anything else worth knowing, optional
        </label>
        <textarea
          id="suggest-note"
          value={note}
          maxLength={SUGGESTION_LIMITS.note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="What you expected, where you saw it, what your teacher or dictionary says."
          className="w-full rounded-[var(--r)] border px-3 py-2.5 text-sm outline-none"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" }}
        />
      </div>

      {error && (
        <p className="mt-3 rounded-[var(--r)] px-3 py-2 text-sm" style={{ background: "var(--again-soft)", color: "var(--again-ink)" }}>
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={send} disabled={pending}>
          {pending ? "Sending…" : "Send it"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Not now</Button>
      </div>
    </div>
  );
}
