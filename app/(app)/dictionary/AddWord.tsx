"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus } from "lucide-react";
import { createLexemeWithForms } from "@/app/actions";
import { Button } from "@/components/Button";
import { Card } from "@/components/ui";
import { DiacriticBar } from "@/components/DiacriticBar";
import { NO_VALUE } from "@/lib/copy/values";

const NOUN_FIELDS = [
  ["NOM_SG", "Nominative sg", "tuba"],
  ["GEN_SG", "Genitive sg", "toa"],
  ["PART_SG", "Partitive sg", "tuba"],
  ["ILL_SG_SHORT", "Short illative", "tuppa"],
  // The nominative plural is here because nothing derives it any more. It was
  // `genitive + d`, which `npm run audit:cases` found wrong for every pronoun
  // and for the words that have no plural, so a word typed in by hand has to
  // be able to carry its own.
  ["NOM_PL", "Nominative pl", "toad"],
  ["PART_PL", "Partitive pl", "tube"],
  ["GEN_PL", "Genitive pl", "tubade"],
] as const;

const VERB_FIELDS = [
  ["INF_MA", "ma-infinitive", "lugema"],
  ["INF_DA", "da-infinitive", "lugeda"],
  ["PRES_1SG", "Present 1sg", "loen"],
  ["PAST_1SG", "Past 1sg", "lugesin"],
  ["PART_TUD", "tud-participle", "loetud"],
] as const;

const LEVELS = ["", "A1", "A2", "B1", "B2", "C1", "C2"] as const;

export interface WordDraft {
  id: string;
  lemma: string;
  translation: string;
  pos: string;
  cefr: string | null;
  government: string | null;
  forms: { formType: string; value: string }[];
}

/**
 * Adds or corrects a word, with its principal parts — which is the whole point.
 * Gradation is worked out from the two stems on save, so an entry typed here
 * behaves exactly like a built-in one.
 *
 * Editing matters as much as adding: the built-in dictionary is hand-written and
 * will contain mistakes, and a wrong form that cannot be fixed gets drilled.
 */
export function AddWord({ initialLemma = "", edit }: { initialLemma?: string; edit?: WordDraft }) {
  const [open, setOpen] = useState(Boolean(initialLemma));
  const [pos, setPos] = useState(edit?.pos ?? "NOUN");
  const [lemma, setLemma] = useState(edit?.lemma ?? initialLemma);
  const [translation, setTranslation] = useState(edit?.translation ?? "");
  const [cefr, setCefr] = useState(edit?.cefr ?? "");
  const [government, setGovernment] = useState(edit?.government ?? "");
  const [forms, setForms] = useState<Record<string, string>>(
    Object.fromEntries((edit?.forms ?? []).map((f) => [f.formType, f.value])),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const fields = pos === "VERB" ? VERB_FIELDS : pos === "PHRASE" ? [] : NOUN_FIELDS;

  const field = { borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink)" } as const;

  const setForm = (key: string, value: string) => setForms((f) => ({ ...f, [key]: value }));

  const submit = () => {
    setError(null);
    start(async () => {
      // The citation form doubles as the first principal part, so it is filled in
      // automatically rather than asked for twice.
      const filled = { ...forms };
      const first = pos === "VERB" ? "INF_MA" : "NOM_SG";
      if (fields.length && !filled[first]) filled[first] = lemma;

      const result = await createLexemeWithForms({
        id: edit?.id, lemma, translation, pos, cefr, government, forms: filled,
      });
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
      if (!edit) { setForms({}); setTranslation(""); }

      /*
        GO TO THE WORD, AS A REAL NAVIGATION, AND DO NOT ASK THE ROUTER NICELY.

        The reader has just saved a word and is looking at the screen that says
        that word does not exist. Getting them to the entry is the whole point
        of the interaction, so it may not be best-effort.

        Both softer versions were tried here and both are unreliable. Firing
        `router.refresh()` in the same tick as a push races the navigation
        already in flight, which the previous version of this comment
        described. Removing the refresh and letting the Server Action's own
        `revalidatePath` refresh the route is no better: measured over eight
        runs against a warm server, the browser was left on the add form three
        times, while a plain fetch of the same URL at that exact moment
        returned the finished entry every single time. The save had worked, the
        row was there, the server would render it, and only the client had not
        moved. A hard reload always showed it.

        So the reader's word is worth one document load. This is a thing a
        person does a handful of times, not a keystroke, and a navigation the
        framework cannot drop is worth more here than staying in the SPA. The
        destination is `force-dynamic`, so it renders fresh on arrival.
      */
      window.location.assign(`/dictionary?q=${encodeURIComponent(result.lemma)}`);
    });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        {edit
          ? <><Pencil size={14} aria-hidden /> Edit</>
          : <><Plus size={15} aria-hidden /> Add a word</>}
      </Button>
    );
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold" style={{ color: "var(--ink)" }}>
          {edit ? `Edit ${edit.lemma}` : "Add a word"}
        </h2>
        <button type="button" onClick={() => setOpen(false)} className="text-xs" style={{ color: "var(--ink-3)" }}>
          Cancel
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>Estonian</span>
          <input
            value={lemma}
            onChange={(e) => setLemma(e.target.value)}
            placeholder="sõna"
            className="field text-md"
            style={field}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>English</span>
          <input
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            placeholder="word"
            className="field text-md"
            style={field}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>Type</span>
          <select value={pos} onChange={(e) => setPos(e.target.value)} className="field text-sm" style={field}>
            <option value="NOUN">Noun</option>
            <option value="VERB">Verb</option>
            <option value="PRONOUN">Pronoun</option>
            <option value="ADJECTIVE">Adjective</option>
            <option value="PHRASE">Phrase</option>
            <option value="OTHER">Other</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>Level</span>
          <select value={cefr} onChange={(e) => setCefr(e.target.value)} className="field text-sm" style={field}>
            {LEVELS.map((l) => <option key={l} value={l}>{l || NO_VALUE}</option>)}
          </select>
        </label>
        {pos === "VERB" && (
          <label className="flex flex-1 flex-col gap-1.5" style={{ minWidth: 220 }}>
            <span className="label-xs" style={{ color: "var(--ink-3)" }}>Government (optional)</span>
            <input
              value={government}
              onChange={(e) => setGovernment(e.target.value)}
              placeholder="partitive, aitan sind"
              className="field text-sm"
              style={field}
            />
          </label>
        )}
      </div>

      {fields.length > 0 && (
        <div>
          <p className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>Principal parts</p>
          <p className="mb-3 text-xs" style={{ color: "var(--ink-3)" }}>
            Fill in what you know. The genitive alone unlocks all eleven regular cases. Blanks stay
            blank. Nothing is guessed.
          </p>
          <div className="grid gap-2 md:grid-cols-3">
            {fields.map(([key, label, example]) => (
              <label key={key} className="flex flex-col gap-1">
                <span className="text-2xs" style={{ color: "var(--ink-3)" }}>{label}</span>
                <input
                  value={forms[key] ?? ""}
                  onChange={(e) => setForm(key, e.target.value)}
                  placeholder={example}
                  className="field text-base"
                  style={field}
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-xs" style={{ color: "var(--again-ink)" }}>{error}</p>}

      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" onClick={submit} disabled={pending || !lemma.trim() || !translation.trim()}>
          {pending ? "Saving…" : edit ? "Save changes" : "Save word"}
        </Button>
        <DiacriticBar label="Insert an Estonian letter into the field you're typing in" />
      </div>
    </Card>
  );
}
