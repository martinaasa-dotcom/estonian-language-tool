"use client";

import { createRef, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Check, Repeat, X } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { addToDeck, gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { Chip, Stat } from "@/components/ui";
import { EstonianInput } from "@/components/EstonianInput";
import { DiacriticBar } from "@/components/DiacriticBar";
import { Speak } from "@/components/Speak";
import { SuggestFix } from "@/components/SuggestFix";
import { useFeedbackSound } from "@/components/AudioPrefs";
import { checkAnswer, countsAsRecalled, type AnswerCheck } from "@/lib/estonian/answer";
import { VERB_GROUP_LABELS } from "@/lib/estonian/morph";

export type Tense = "present" | "conditional";

export interface ConjugationQuestion {
  /** The card this question practises, when the verb is already in the deck. */
  cardId: string | null;
  lexemeId: string;
  lemma: string;
  translation: string;
  cefr: string | null;
  inDeck: boolean;
  tense: Tense;
  /** The first person, shown: the principal part the rest hang off. */
  given: { person: string; value: string };
  /** The five to type, in table order. */
  blanks: { person: string; code: string; answer: string; origin: "EKILEX" | "STORED" | "DERIVED" }[];
}

const GROUP: Record<Tense, "PRESENT" | "CONDITIONAL"> = { present: "PRESENT", conditional: "CONDITIONAL" };

/**
 * A verb table, typed and marked a cell at a time.
 *
 * The whole table is checked at once rather than a row at a time, because
 * running down all six persons without stopping is the skill, and a verdict
 * after every row turns it into five separate questions. Each cell is marked
 * the way a typed review answer is: a dropped õ is named as a dropped õ, a
 * slipped key as a slip, and a wrong form as wrong with the right one beside
 * it. The verdicts are what `checkAnswer` says and nothing else.
 */
export function ConjugationSession({ questions: initialQuestions }: { questions: ConjugationQuestion[] }) {
  // Snapshotted once: gradeCard is a Server Action and the page re-renders
  // after every call with a freshly drawn round. See GovernmentSession.
  const [questions] = useState(initialQuestions);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState<string[]>([]);
  const [verdicts, setVerdicts] = useState<AnswerCheck[] | null>(null);
  const [cellsRight, setCellsRight] = useState(0);
  const [tablesRight, setTablesRight] = useState(0);
  const [added, setAdded] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const sound = useFeedbackSound();

  const question = questions[index];
  const finished = !question;
  const revealed = verdicts !== null;

  // One ref per blank, remade per question, so Enter can walk down the table.
  const inputs = useMemo<RefObject<HTMLInputElement | null>[]>(
    () => (question ? question.blanks.map(() => createRef<HTMLInputElement>()) : []),
    [question],
  );

  useEffect(() => {
    setTyped(question ? question.blanks.map(() => "") : []);
    setVerdicts(null);
    setAdded(null);
    // Focus the first blank once the row has drawn.
    const t = window.setTimeout(() => inputs[0]?.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [index, question, inputs]);

  const check = useCallback(() => {
    if (!question || verdicts) return;
    const marks = question.blanks.map((b, i) => checkAnswer(typed[i] ?? "", b.answer, "et"));
    setVerdicts(marks);
    // A near miss counts as recalled, the way it does in review: a dropped õ is
    // a spelling slip and not a wrong form. A clean table is stricter, since
    // that is the thing being celebrated.
    const right = marks.filter((m) => countsAsRecalled(m.verdict)).length;
    const clean = marks.every((m) => m.verdict === "correct");
    setCellsRight((c) => c + right);
    if (clean) setTablesRight((t) => t + 1);
    sound(right === marks.length ? "right" : "wrong");
    // ADR-016: the same review log as every other mode. Four of five is the
    // table known; less is a lapse worth seeing again.
    if (question.cardId) {
      void gradeCard(question.cardId, right >= marks.length - 1 ? 3 : 1, Date.now() - startedAt.current).catch(() => {});
    }
  }, [question, verdicts, typed, sound]);

  const next = useCallback(() => setIndex((i) => i + 1), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished || !question) return;
      /*
        The Enter that checks the table is pressed inside the last input, and
        React flushes that discrete event synchronously: by the time it
        bubbles to the window the table is marked, this listener has been
        re-registered with `revealed` true, and it would move to the next verb
        before anybody had seen a single mark. So a key from a field belongs
        to the field. The same guard ReviewSession carries, for the same event.
      */
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (revealed && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finished, question, revealed, next]);

  if (finished) {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const cells = questions.reduce((n, q) => n + q.blanks.length, 0);
    const accuracy = cells ? Math.round((cellsRight / cells) * 100) : 0;
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Round complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          {tablesRight === questions.length
            ? "Every table clean. The endings are yours; what is left is the verbs whose first person you have not met yet."
            : "The endings never change. What trips people is the stem, and that is the one part worth looking up when a table goes wrong."}
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={`${tablesRight}/${questions.length}`} label="Tables" />
          <Stat value={`${accuracy}%`} label="Forms right" tone={accuracy >= 80 ? "var(--good)" : "var(--hard)"} />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
          <ButtonLink href="/review/conjugation">Another round</ButtonLink>
        </div>
      </div>
    );
  }

  const group = VERB_GROUP_LABELS[GROUP[question.tense]];
  const derivedOnly = question.blanks.every((b) => b.origin === "DERIVED");

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      <h1 className="sr-only">Conjugation</h1>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(index / questions.length) * 100}%`, background: "var(--accent)" }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-label="Round progress"
          />
        </div>
        <span className="tnum text-sm" style={{ color: "var(--ink-3)" }}>
          {questions.length - index} left
        </span>
      </div>

      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent"><Repeat size={12} aria-hidden /> <span lang="et">{group.et}</span></Chip>
          {question.cefr && <Chip>{question.cefr}</Chip>}
          {!question.inDeck && <Chip tone="good">new to you</Chip>}
        </div>

        <div className="px-6 pt-7 text-center">
          <div className="flex items-center justify-center gap-2">
            <p lang="et" className="text-3xl font-semibold" style={{ color: "var(--ink)" }}>
              {question.lemma}
            </p>
            <Speak text={question.lemma} />
          </div>
          <p className="mt-1 text-[13.5px]" style={{ color: "var(--ink-3)" }}>{question.translation}</p>
          <p className="mt-4 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
            {question.tense === "present"
              ? "The first person is given. Type the other five."
              : "The conditional, from the same stem. Type the other five."}
          </p>
        </div>

        <div className="overflow-x-auto px-6 py-5">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td lang="et" className="w-16 py-2 pr-3 text-base" style={{ color: "var(--ink-2)" }}>
                  {question.given.person}
                </td>
                <td className="py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span lang="et" className="text-lg font-bold" style={{ color: "var(--accent-deep)" }}>
                      {question.given.value}
                    </span>
                    <Speak text={question.given.value} size={13} />
                  </span>
                </td>
              </tr>
              {question.blanks.map((blank, i) => {
                const mark = verdicts?.[i];
                return (
                  <tr key={blank.code} className="ending-row" style={{ borderTop: "1px solid var(--rule-soft)" }}>
                    <td lang="et" className="w-16 py-2 pr-3 text-base" style={{ color: "var(--ink-2)" }}>
                      {blank.person}
                    </td>
                    <td className="py-2">
                      {!mark ? (
                        <EstonianInput
                          compact
                          bar={false}
                          value={typed[i] ?? ""}
                          ariaLabel={`${question.lemma}, ${blank.person}`}
                          inputRef={inputs[i]}
                          onChange={(next) => setTyped((t) => t.map((v, j) => (j === i ? next : v)))}
                          onEnter={() => {
                            const following = inputs[i + 1]?.current;
                            if (following) following.focus();
                            else check();
                          }}
                        />
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            lang="et"
                            className="pop-in text-lg font-semibold"
                            style={{ color: mark.verdict === "correct" ? "var(--good-ink)" : mark.verdict === "wrong" ? "var(--again-ink)" : "var(--hard-ink)" }}
                          >
                            <Ending stem={question.given.value} form={blank.answer} />
                          </span>
                          <Speak text={blank.answer} size={13} />
                          {mark.verdict === "correct" ? (
                            <Check size={15} aria-label="Right" style={{ color: "var(--good-ink)" }} />
                          ) : (
                            <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                              {typed[i]?.trim()
                                ? <>You typed <span lang="et">{typed[i]?.trim()}</span>. {mark.verdict === "wrong" ? "" : mark.note}</>
                                : "Nothing typed."}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/*
            One row of keys for the whole table rather than one under each of
            the five fields, which drew the same six keys five times over. The
            shared bar types into whichever field has focus, and falls back to
            the first while nothing does.
          */}
          {!revealed && (
            <div className="mt-3">
              <DiacriticBar standalone={false} fallbackRef={inputs[0]} />
            </div>
          )}
        </div>

        <div className="border-t px-6 py-5" style={{ borderColor: "var(--rule-soft)" }} aria-live="polite">
          {!revealed ? (
            <Button variant="primary" onClick={check}>
              Check the table <kbd className="ml-1">↵</kbd>
            </Button>
          ) : (
            <>
              <p className="text-sm" style={{ color: "var(--ink-3)" }}>
                {derivedOnly
                  ? "Regular endings on the first person, checked against Ekilex for every verb in this dictionary."
                  : "Forms as Ekilex records them."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="primary" onClick={next} autoFocus>
                  Next <kbd className="ml-1">↵</kbd>
                </Button>
                {!question.inDeck && (
                  <Button
                    disabled={added === question.lexemeId}
                    onClick={async () => {
                      await addToDeck(question.lexemeId, ["RECOGNITION", "PRODUCTION", "CONJUGATION"], "DICTIONARY");
                      setAdded(question.lexemeId);
                    }}
                  >
                    {added === question.lexemeId ? "Added to your deck" : "Add to my deck"}
                  </Button>
                )}
                {verdicts.some((m) => m.verdict !== "correct") && (
                  <SuggestFix
                    category="MARKED_WRONG"
                    categories={["MARKED_WRONG", "WRONG_FORM"]}
                    lemma={question.lemma}
                    trigger={`Conjugation of ${question.lemma}, ${group.et}. Expected ${question.blanks.map((b) => b.answer).join(", ")}.`}
                    label="I think that was right"
                  />
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <p className="mt-4 text-center text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        {tablesRight}/{index + (revealed ? 1 : 0)} tables clean · Enter moves down the table
      </p>
    </div>
  );
}

/**
 * A form with the part a person adds lit up: what `algan` and `algad` share is
 * the stem, and the letters after it are the ending the table is teaching.
 * Read off the two strings rather than off the rule, so a stored irregular
 * form (`olen`, `on`) is shown honestly with whatever it does not share.
 */
function Ending({ stem, form }: { stem: string; form: string }) {
  let shared = 0;
  while (shared < stem.length && shared < form.length && stem[shared] === form[shared]) shared += 1;
  // A form that shares nothing, or everything, has no ending worth lighting.
  if (shared === 0 || shared === form.length) return <>{form}</>;
  return (
    <>
      {form.slice(0, shared)}
      <span className="ending">{form.slice(shared)}</span>
    </>
  );
}
