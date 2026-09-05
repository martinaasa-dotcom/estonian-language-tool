"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, CircleAlert, Loader2, ScissorsLineDashed, X } from "lucide-react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { buildClozeFromText, gradeCard } from "@/app/actions";
import { Button, ButtonLink } from "@/components/Button";
import { DiacriticBar } from "@/components/DiacriticBar";
import { Chip, Page, Stat } from "@/components/ui";
import { Speak } from "@/components/Speak";
import {
  BLANK, MAX_PASSAGE_CHARS, type ClozeItem, isClozeCorrect, isDiacriticSlip,
} from "@/lib/estonian/passage";
import { VERDICT_CLASS, VERDICT_INK } from "@/lib/ux/verdict";
import { isAdvanceKey } from "@/lib/ux/advanceKey";

/** A gap, plus the card it is practicing. */
type Gap = ClozeItem & { cardId: string | null };

type Phase = "paste" | "drill" | "done";

export function ClozeSession() {
  const [phase, setPhase] = useState<Phase>("paste");
  const [text, setText] = useState("");
  const [items, setItems] = useState<Gap[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState("");
  const [checked, setChecked] = useState(false);
  const [correct, setCorrect] = useState(0);
  const startedAt = useRef(Date.now());

  const item = items[index];

  const build = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await buildClozeFromText(text);
      if (!result.ok) { setError(result.error); return; }
      setItems(result.items);
      setPhase("drill");
      startedAt.current = Date.now();
    } catch {
      setError("Couldn't read that text. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }, [text]);

  const next = useCallback(() => {
    setChecked(false);
    setAttempt("");
    if (index + 1 >= items.length) setPhase("done");
    else setIndex((i) => i + 1);
  }, [index, items.length]);

  const check = useCallback(() => {
    if (!item || checked || !attempt.trim()) return;
    setChecked(true);
    const right = isClozeCorrect(attempt, item.answer);
    if (right) setCorrect((c) => c + 1);

    /*
      ADR-016: every practice mode writes to the same review log, so the
      scheduler sees what was actually practiced rather than treating this as a
      side game with a score of its own. A missing diacritic is a keyboard slip,
      not a memory failure, so it grades Hard rather than Again.
    */
    if (item.cardId) {
      const rating = right ? 3 : isDiacriticSlip(attempt, item.answer) ? 2 : 1;
      void gradeCard(item.cardId, rating, 0).catch(() => {});
    }
  }, [item, checked, attempt]);

  useEffect(() => {
    if (phase !== "drill") return;
    const onKey = (e: KeyboardEvent) => {
      if (checked) { if (isAdvanceKey(e)) { e.preventDefault(); next(); } return; }
      if (e.key !== "Enter") return;
      e.preventDefault();
      check();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, checked, check, next]);

  if (phase === "paste") {
    return (
      <Page
        title="From your reading"
        lead="Paste Estonian you are actually reading. Words already in your deck get blanked out."
      >
        <div
          className="rounded-lg border p-5"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <label htmlFor="passage" className="label-xs block" style={{ color: "var(--ink-3)" }}>
            Estonian text
          </label>
          <textarea
            id="passage"
            lang="et"
            rows={10}
            value={text}
            autoFocus
            maxLength={MAX_PASSAGE_CHARS}
            onChange={(e) => setText(e.target.value)}
            placeholder="Kleebi siia artikkel, kodutöö või sõnum…"
            className="field-lg mt-2 w-full resize-y text-base"
            style={{ borderColor: "var(--rule)", background: "var(--raised)", color: "var(--ink)" }}
          />
          <div className="under-field flex items-center justify-between gap-3">
            <DiacriticBar />
            <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>
              {text.length}/{MAX_PASSAGE_CHARS}
            </span>
          </div>

          {error && (
            <p role="alert" className="mt-3 text-sm" style={{ color: "var(--again-ink)" }}>{error}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/">Back to Today</ButtonLink>
            <Button variant="primary" disabled={busy || !text.trim()} onClick={() => void build()}>
              {busy
                ? <><Loader2 size={15} className="animate-spin" aria-hidden /> Reading…</>
                : "Make exercises"}
            </Button>
          </div>

          <p className="mt-4 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
            Your text isn&rsquo;t saved. It&rsquo;s just used to find your words, then thrown away.
          </p>
        </div>
      </Page>
    );
  }

  if (phase === "done") {
    const minutes = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    const accuracy = Math.round((correct / items.length) * 100);
    return (
      <div className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <h1 className="text-[32px] font-bold tracking-tight" style={{ color: "var(--ink)" }}>
          Passage complete
        </h1>
        <p className="mt-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
          Every answer there was a form a native writer chose, in a sentence they actually wrote.
          That is a better model than any exercise book.
        </p>
        <div
          className="mt-8 grid grid-cols-3 gap-6 rounded-lg border p-6"
          style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
        >
          <Stat value={items.length} label="Gaps" />
          <Stat value={`${accuracy}%`} label="Right" tone={VERDICT_INK[accuracy >= 80 ? "right" : "nearly"]} />
          <Stat value={`${minutes}m`} label="Time" />
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button onClick={() => { setPhase("paste"); setItems([]); setIndex(0); setCorrect(0); setText(""); }}>
            Another passage
          </Button>
          <ButtonLink href="/" variant="primary">Back to Today</ButtonLink>
        </div>
      </div>
    );
  }

  if (!item) return null;

  const right = isClozeCorrect(attempt, item.answer);
  const slip = isDiacriticSlip(attempt, item.answer);
  // The same three the grade above sends: a slip is graded Hard and painted
  // nearly, rather than the peach a blank gets.
  const verdict = right ? "right" : slip ? "nearly" : "wrong";
  const [before = "", after = ""] = item.masked.split(BLANK.trim());

  return (
    <div className="mx-auto flex max-w-2xl flex-col px-5 py-6 md:px-10 md:py-10">
      {/* The heading a session screen has no room to draw. Same line as every
          other mode: the start screen and the finished screen each carry one
          and the round itself did not. */}
      <h1 className="sr-only">From your reading</h1>
      <div className="mb-6 flex items-center justify-between gap-4">
        <Link href="/" aria-label="End session" className="rounded p-1" style={{ color: "var(--ink-3)" }}>
          <X size={19} aria-hidden />
        </Link>
        <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${(index / items.length) * 100}%`, background: "var(--accent)" }}
            role="progressbar"
            aria-valuenow={index}
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-label="Passage progress"
          />
        </div>
        <span className="tnum text-sm" style={{ color: "var(--ink-3)" }}>
          {items.length - index} left
        </span>
      </div>

      <div
        className="rounded-xl border"
        style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow)" }}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-6 py-3" style={{ borderColor: "var(--rule-soft)" }}>
          <Chip tone="accent"><ScissorsLineDashed size={12} aria-hidden /> Fill the gap</Chip>
          <Chip>{item.lemma} · {item.translation}</Chip>
        </div>

        <div className="px-6 py-8">
          <p lang="et" className="text-lg leading-relaxed" style={{ color: "var(--ink)" }}>
            {before}
            <span
              className={`${checked ? VERDICT_CLASS[verdict] : ""} mx-1 inline-block min-w-[5ch] rounded px-2 text-center`}
              style={checked ? undefined : { background: "var(--raised)", color: "var(--ink-3)" }}
            >
              {checked ? item.answer : "____"}
            </span>
            {after}
          </p>

          <p className="mt-3 text-sm" style={{ color: "var(--ink-3)" }}>
            Hint: the {item.formLabel} of <span lang="et">{item.lemma}</span>
          </p>

          <div className="mt-5">
            <label htmlFor="attempt" className="label-xs block" style={{ color: "var(--ink-3)" }}>
              The missing word
            </label>
            <input
              id="attempt"
              lang="et"
              value={attempt}
              autoFocus
              disabled={checked}
              onChange={(e) => setAttempt(e.target.value)}
              className="field-lg mt-2 w-full text-lg disabled:opacity-70"
              style={{ borderColor: "var(--rule)", background: "var(--raised)", color: "var(--ink)" }}
            />
            {!checked && <div className="under-field"><DiacriticBar /></div>}
          </div>

          {checked && (
            <div className="mt-5" aria-live="polite">
              <div className={`${VERDICT_CLASS[verdict]} flex items-start gap-2.5 rounded-md px-3.5 py-3`}>
                {right
                  ? <Check size={16} className="mt-0.5 shrink-0" aria-hidden />
                  : <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />}
                <p className="text-[15px]">
                  {right
                    ? "Exactly the form the writer used."
                    : slip
                      ? <>Right word, missing a diacritic. The form is <strong lang="et">{item.answer}</strong>. Use the bar under the box.</>
                      : <>The writer used <strong lang="et">{item.answer}</strong>, the {item.formLabel}.</>}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p lang="et" className="text-[15px]" style={{ color: "var(--ink-2)" }}>
                  {item.sentence}
                </p>
                <Speak text={item.sentence} />
              </div>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4" style={{ borderColor: "var(--rule-soft)" }}>
          {!checked ? (
            <Button variant="primary" className="w-full py-3" disabled={!attempt.trim()} onClick={check}>
              Check <kbd className="ml-1">↵</kbd>
            </Button>
          ) : (
            <Button variant="primary" className="w-full py-3" onClick={next} autoFocus>
              {index + 1 >= items.length ? "Finish" : "Next"} <kbd className="ml-1">↵</kbd>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
