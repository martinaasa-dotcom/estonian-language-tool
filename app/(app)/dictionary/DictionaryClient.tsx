"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Plus, Search, Star } from "lucide-react";
import { addToDeck, toggleStar } from "@/app/actions";
import { Button } from "@/components/Button";
import { EstonianInput } from "@/components/EstonianInput";
import { Speak } from "@/components/Speak";
import { Card, Chip, Empty } from "@/components/ui";
import { buildCaseTable } from "@/lib/estonian/derive";
import { availableCardTypes, CARD_TYPES, type CardType } from "@/lib/srs/cards";
import type { Example } from "@/lib/dict/examples";
import { Examples } from "./Examples";
import { Paradigm } from "./Paradigm";
import type { SearchHit } from "@/lib/dict/search";
import { AddWord, type WordDraft } from "./AddWord";
import { Et } from "@/components/Et";
import { SuggestFix } from "@/components/SuggestFix";
import { NO_VALUE } from "@/lib/copy/values";

export interface EntryForm {
  formType: string;
  value: string;
  isPrincipal: boolean;
  morphCode: string | null;
  morphName: string | null;
  orderIndex: number;
}

export interface EntryView {
  id: string;
  lemma: string;
  translation: string;
  pos: string;
  cefr: string | null;
  gradation: string;
  gradationNote: string | null;
  government: string | null;
  notes: string | null;
  provenance: string;
  inDeck: boolean;
  starred: boolean;
  examples: Example[];
  forms: EntryForm[];
}

const NOUN_PARTS = [
  ["NOM_SG", "Nominative sg", "nimetav"],
  ["GEN_SG", "Genitive sg", "omastav"],
  ["PART_SG", "Partitive sg", "osastav"],
  ["ILL_SG_SHORT", "Short illative", "lühike sisseütlev"],
  ["PART_PL", "Partitive pl", "mitmuse osastav"],
] as const;

const VERB_PARTS = [
  ["INF_MA", "ma-infinitive", "ma-tegevusnimi"],
  ["INF_DA", "da-infinitive", "da-tegevusnimi"],
  ["PRES_1SG", "Present 1sg", "olevik, ma"],
  ["PAST_1SG", "Past 1sg", "lihtminevik, ma"],
  ["PART_TUD", "tud-participle", "umbisikuline"],
] as const;

export function DictionaryClient({
  initialQuery, hits, entry, matchedAs, suggestions, starred, tutorReady, justFetched,
}: {
  initialQuery: string;
  /** True when this word was pulled from Ekilex on this request. */
  justFetched?: boolean;
  hits: SearchHit[];
  entry: EntryView | null;
  /** Set when the query was an inflected form — "inessive (seesütlev) of tuba". */
  matchedAs: string | null;
  suggestions: string[];
  /** Words this learner has starred — shown on the landing view. */
  starred: { lemma: string; translation: string }[];
  /** Whether Anu can be asked to translate an example sentence. */
  tutorReady: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [pending, start] = useTransition();

  const showingEntry = entry !== null;

  const go = (q: string) => {
    setQuery(q);
    start(() => router.push(q.trim() ? `/dictionary?q=${encodeURIComponent(q.trim())}` : "/dictionary"));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="flex-1">
          <EstonianInput
            value={query}
            onChange={setQuery}
            onEnter={() => go(query)}
            placeholder="Search Estonian or English, try tuba, or room"
            ariaLabel="Search the dictionary"
            large
            autoFocus={!initialQuery}
          />
        </div>
        <Button variant="primary" onClick={() => go(query)} disabled={pending} className="py-3">
          <Search size={16} aria-hidden /> Search
        </Button>
      </div>

      {!showingEntry && initialQuery === "" && starred.length > 0 && (
        <div>
          <p className="label-xs mb-2 flex items-center gap-1.5" style={{ color: "var(--ink-3)" }}>
            <Star size={12} aria-hidden /> Starred
          </p>
          <ul className="flex flex-wrap gap-2">
            {starred.map((s) => (
              <li key={s.lemma}>
                <button
                  type="button"
                  onClick={() => go(s.lemma)}
                  className="choice-btn flex items-baseline gap-2 rounded-md border px-3 py-1.5 text-left"
                >
                  <span lang="et" className="est text-base" style={{ color: "var(--ink)" }}>{s.lemma}</span>
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>{s.translation}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!showingEntry && initialQuery === "" && <AddWord />}

      {!initialQuery && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-xs" style={{ color: "var(--ink-3)" }}>Try</span>
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => go(s)}
              lang="et"
              className="est press rounded-full px-4 py-1.5 text-base transition-ui hover:-translate-y-px"
              style={{ background: "var(--surface)", color: "var(--ink-2)", boxShadow: "var(--shadow-sm)" }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {initialQuery && hits.length === 0 && (
        <div className="flex flex-col gap-4">
          <Empty
            title={`Nothing found for "${initialQuery}"`}
            body="The built-in dictionary covers common words up to B2. Add this one yourself, put in the genitive and you get the whole case table, audio and cards, exactly like a built-in word."
          />
          <AddWord initialLemma={initialQuery} />
          {/*
            A search that found nothing is the commonest dead end in the app,
            and until now it ended here. Adding the word yourself is the fix
            for one person; telling us it is missing is the fix for the next
            person who looks it up, and most people who meet this know the
            word exists because they are holding it on a page in front of them.
          */}
          <div className="flex flex-col gap-2">
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              Sure this word exists? Tell us and it goes to the Kodukeel team, who can put it in the
              dictionary for everybody.
            </p>
            <div>
              <SuggestFix
                category="MISSING_WORD"
                lemma={initialQuery}
                trigger={`The dictionary found nothing for "${initialQuery}"`}
                label="This word is missing"
                tone="loud"
              />
            </div>
          </div>
        </div>
      )}

      {entry && (
        <>
          {justFetched && (
            <p
              className="rounded-[var(--r)] px-4 py-3 text-sm font-medium"
              style={{ background: "var(--good-soft)", color: "var(--good-ink)" }}
            >
              Fetched from Ekilex and saved, this word now works offline too.
            </p>
          )}
          {matchedAs && (
            <p
              className="rounded-[var(--r)] px-4 py-3 text-sm"
              style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            >
              <Et serif={false} className="font-semibold">{initialQuery}</Et> is the {matchedAs}.
            </p>
          )}
          <Entry entry={entry} tutorReady={tutorReady} />
        </>
      )}

      {hits.length > 1 && (
        <div>
          <p className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            {hits.length - 1} other match{hits.length - 1 === 1 ? "" : "es"}
          </p>
          <ul className="flex flex-wrap gap-2">
            {hits.slice(1).map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => go(h.lemma)}
                  className="press flex items-baseline gap-2 rounded-full border px-4 py-2 text-left transition-ui hover:-translate-y-px"
                  style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
                >
                  <span lang="et" className="est text-base" style={{ color: "var(--ink)" }}>{h.lemma}</span>
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                    {h.matchedAs ? h.matchedAs : h.translation}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Entry({ entry, tutorReady }: { entry: EntryView; tutorReady: boolean }) {
  const isNoun = entry.pos === "NOUN" || entry.pos === "ADJECTIVE";
  const isVerb = entry.pos === "VERB";
  const parts = isVerb ? VERB_PARTS : NOUN_PARTS;
  const form = (t: string) => entry.forms.find((f) => f.formType === t)?.value;

  // Ekilex hands over the whole paradigm, so when we have it there is nothing to
  // derive — we show the authoritative forms, including irregular plurals and the
  // parallel forms Estonian genuinely has (raamatutes / raamatuis).
  // Every form Ekilex labelled, principal parts included: the 1sg present is
  // both a principal part *and* the "ma" row of the conjugation table, and
  // leaving it out left a hole in the middle of the table.
  const retrieved = entry.forms.filter((f) => f.morphCode);

  const table = isNoun
    ? buildCaseTable({
        nomSg: form("NOM_SG"), genSg: form("GEN_SG"),
        partSg: form("PART_SG"), partPl: form("PART_PL"), genPl: form("GEN_PL"),
      })
    : [];

  return (
    <Card className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 lang="et" className="est text-3xl font-bold leading-none" style={{ color: "var(--ink)" }}>
              {entry.lemma}
            </h2>
            <Speak text={entry.lemma} />
            <Speak text={entry.lemma} slow label={`Hear "${entry.lemma}" slowly`} />
          </div>
          <p className="mt-2 text-md" style={{ color: "var(--ink-2)" }}>{entry.translation}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip>{entry.pos.toLowerCase()}</Chip>
            {entry.cefr && <Chip tone="accent">{entry.cefr}</Chip>}
            {entry.gradationNote && (
              <Chip tone="hard" caseSensitive title="Consonant gradation, this is why the stem changes">
                gradation {entry.gradationNote}
              </Chip>
            )}
            {entry.provenance === "AI" && <Chip tone="again">AI · verify</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StarButton id={entry.id} starred={entry.starred} />
          <AddWord
            key={entry.id}
            edit={{
              id: entry.id,
              lemma: entry.lemma,
              translation: entry.translation,
              pos: entry.pos,
              cefr: entry.cefr,
              government: entry.government,
              forms: entry.forms,
            } satisfies WordDraft}
          />
          <AddToDeck entry={entry} />
        </div>
      </header>

      {/*
        Disagreeing with the entry, for somebody who is not going to open the
        edit form. The dictionary is shared and hand-editable, and that is the
        right tool for a typo you are certain about; this is the one for "my
        teacher says this is the wrong sense", which is a judgement somebody
        should look at before it changes what everybody reads.
      */}
      <EntryProblem entry={entry} />

      {entry.notes && (
        <p className="rounded-[var(--r)] px-4 py-3.5 text-sm" style={{ background: "var(--raised)", color: "var(--ink-2)" }}>
          {entry.notes}
        </p>
      )}

      {entry.government && (
        <div>
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            Government · rektsioon
          </h3>
          <p className="rounded-[var(--r)] px-4 py-3.5 text-base" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}>
            {entry.government}
          </p>
        </div>
      )}

      <Examples lexemeId={entry.id} examples={entry.examples} tutorReady={tutorReady} />

      {entry.forms.length > 0 && (
        <div>
          <h3 className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>
            Principal parts, the forms you have to memorise
          </h3>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(124px, 1fr))" }}>
            {parts.map(([type, label, et]) => {
              const value = form(type);
              return (
                <div
                  key={type}
                  className="rounded-[var(--r)] px-3 py-3.5 text-center"
                  style={{ background: value ? "var(--accent-soft)" : "var(--raised)" }}
                >
                  {value ? (
                    <>
                      <span lang="et" className="est block text-lg font-bold" style={{ color: "var(--accent-deep)" }}>{value}</span>
                      <Speak text={value} />
                    </>
                  ) : (
                    <span className="est block text-lg" style={{ color: "var(--ink-3)" }}>{NO_VALUE}</span>
                  )}
                  <span className="label-xs mt-1.5 block" style={{ color: "var(--ink-3)" }}>{label}</span>
                  <span lang="et" className="mt-0.5 block text-2xs italic" style={{ color: "var(--ink-3)" }}>{et}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {retrieved.length > 0 ? (
        <Paradigm
          pos={entry.pos}
          forms={retrieved.map((f) => ({ value: f.value, morphCode: f.morphCode, morphName: f.morphName }))}
        />
      ) : isNoun && form("GEN_SG") && (
        <div>
          <h3 className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>
            The rest, worked out from the genitive
          </h3>
          <p className="mb-3 text-xs" style={{ color: "var(--ink-3)" }}>
            Learn <Et className="text-base" >{form("GEN_SG")}</Et> and these eleven follow as regular endings.
          </p>
          <div className="overflow-x-auto rounded-[var(--r)] border" style={{ borderColor: "var(--rule)" }}>
            <table className="w-full min-w-[440px] text-sm">
              <thead>
                <tr>
                  {["Case", "Singular", "Plural", "Answers"].map((h) => (
                    <th key={h} className="label-xs px-3 py-2.5 text-left" style={{ background: "var(--raised)", color: "var(--ink-3)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.map(({ spec, singular, plural, origin }) => (
                  <tr key={spec.key} style={{ borderTop: "1px solid var(--rule-soft)" }}>
                    <td className="px-3 py-2" style={{ color: "var(--ink-2)" }}>
                      {/* The same way in the retrieved paradigm gives: this
                          table says what the form is, that page says when to
                          use it. It has to be here too, because a deployment
                          with no Ekilex key only ever renders this one, and
                          without the link its case table is a dead end. */}
                      <Link href={`/grammar/${spec.key.toLowerCase()}`} lang="et" className="hover:underline">
                        {spec.et}
                      </Link>
                      <span className="ml-1.5 text-2xs italic" style={{ color: "var(--ink-3)" }}>{spec.en.toLowerCase()}</span>
                    </td>
                    <td lang="et" className="est px-3 py-2 text-base" style={{ color: origin === "STORED" ? "var(--ink)" : "var(--ink-2)", fontWeight: origin === "STORED" ? 600 : 400 }}>
                      {singular ?? NO_VALUE}
                    </td>
                    <td lang="et" className="est px-3 py-2 text-base" style={{ color: "var(--ink-2)" }}>
                      {plural ?? <span style={{ color: "var(--ink-3)" }}>{NO_VALUE}</span>}
                    </td>
                    <td lang="et" className="px-3 py-2 text-xs" style={{ color: "var(--ink-3)" }}>{spec.question}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!form("GEN_PL") && (
            <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
              Plural forms need the genitive plural, which isn&rsquo;t stored for this word. We leave
              them blank rather than guess, an invented form is worse than a gap.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** The "this is wrong" affordance on a dictionary entry, in one place. */
function EntryProblem({ entry }: { entry: EntryView }) {
  const isVerb = entry.pos === "VERB";
  const parts = isVerb ? VERB_PARTS : NOUN_PARTS;
  const formTypes = parts
    .map(([type, label]) => ({
      formType: type as string,
      label,
      value: entry.forms.find((f) => f.formType === type)?.value ?? "",
    }))
    .filter((f) => f.value);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="text-sm" style={{ color: "var(--ink-3)" }}>
        Something here wrong?
      </p>
      <SuggestFix
        category="WRONG_MEANING"
        categories={["WRONG_MEANING", "WRONG_FORM", "WRONG_EXAMPLE", "OTHER"]}
        lemma={entry.lemma}
        lexemeId={entry.id}
        currentTranslation={entry.translation}
        formTypes={formTypes}
        examples={entry.examples.map((e) => e.et)}
        trigger={`${entry.lemma}: "${entry.translation}"`}
        label="Suggest a correction"
      />
    </div>
  );
}

function StarButton({ id, starred }: { id: string; starred: boolean }) {
  const [on, setOn] = useState(starred);
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      aria-pressed={on}
      aria-label={on ? "Remove this word from your starred list" : "Star this word"}
      disabled={pending}
      onClick={() => start(async () => {
        const result = await toggleStar(id);
        if (result.ok) setOn(result.starred);
      })}
      style={{ color: on ? "var(--hard-ink)" : undefined }}
    >
      <Star size={16} aria-hidden fill={on ? "currentColor" : "none"} />
    </Button>
  );
}

function AddToDeck({ entry }: { entry: EntryView }) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState(entry.inDeck);
  const [pending, start] = useTransition();
  const available = availableCardTypes({
    lemma: entry.lemma, translation: entry.translation, pos: entry.pos,
    gradation: entry.gradation, gradationNote: entry.gradationNote,
    government: entry.government, forms: entry.forms,
  });
  const [selected, setSelected] = useState<CardType[]>(
    CARD_TYPES.filter((t) => t.defaultOn && available.includes(t.type)).map((t) => t.type),
  );

  const submit = () => {
    start(async () => {
      const result = await addToDeck(entry.id, selected);
      if (result.ok) { setAdded(true); setOpen(false); }
    });
  };

  if (!open) {
    return (
      <Button variant={added ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {added ? <><Check size={15} aria-hidden /> In deck</> : <><Plus size={15} aria-hidden /> Add to deck</>}
      </Button>
    );
  }

  return (
    <div className="w-full rounded-[var(--r-lg)] p-5 md:w-80" style={{ background: "var(--raised)" }}>
      <p className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>Which cards?</p>
      <div className="flex flex-col gap-2">
        {CARD_TYPES.filter((t) => available.includes(t.type)).map((t) => (
          <label key={t.type} className="flex cursor-pointer items-start gap-2.5 text-sm" style={{ color: "var(--ink-2)" }}>
            <input
              type="checkbox"
              checked={selected.includes(t.type)}
              onChange={(e) =>
                setSelected((s) => (e.target.checked ? [...s, t.type] : s.filter((x) => x !== t.type)))
              }
              className="mt-0.5"
            />
            <span>
              <span style={{ color: "var(--ink)" }}>{t.label}</span>
              <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{t.description}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <Button variant="primary" onClick={submit} disabled={pending || selected.length === 0} className="flex-1">
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}
