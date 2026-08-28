"use client";

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
import type { SearchHit } from "@/lib/dict/search";
import { AddWord, type WordDraft } from "./AddWord";
import { Et } from "@/components/Et";

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
  initialQuery, hits, entry, matchedAs, suggestions, justFetched,
}: {
  initialQuery: string;
  /** True when this word was pulled from Ekilex on this request. */
  justFetched?: boolean;
  hits: SearchHit[];
  entry: EntryView | null;
  /** Set when the query was an inflected form — "inessive (seesütlev) of tuba". */
  matchedAs: string | null;
  suggestions: string[];
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
            placeholder="Search Estonian or English — try tuba, or room"
            ariaLabel="Search the dictionary"
            large
            autoFocus={!initialQuery}
          />
        </div>
        <Button variant="primary" onClick={() => go(query)} disabled={pending} className="py-3">
          <Search size={16} aria-hidden /> Search
        </Button>
      </div>

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
              className="est press rounded-full px-4 py-1.5 text-[15px] transition-all hover:-translate-y-px"
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
            body="The built-in dictionary covers common words up to B2. Add this one yourself — put in the genitive and you get the whole case table, audio and cards, exactly like a built-in word."
          />
          <AddWord initialLemma={initialQuery} />
        </div>
      )}

      {entry && (
        <>
          {justFetched && (
            <p
              className="rounded-[var(--r)] px-4 py-3 text-[13.5px] font-medium"
              style={{ background: "var(--good-soft)", color: "var(--good)" }}
            >
              Fetched from Ekilex and saved — this word now works offline too.
            </p>
          )}
          {matchedAs && (
            <p
              className="rounded-[var(--r)] px-4 py-3 text-[14px]"
              style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}
            >
              <Et serif={false} className="font-semibold">{initialQuery}</Et> is the {matchedAs}.
            </p>
          )}
          <Entry entry={entry} />
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
                  className="press flex items-baseline gap-2 rounded-full border px-4 py-2 text-left transition-all hover:-translate-y-px"
                  style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
                >
                  <span lang="et" className="est text-[15px]" style={{ color: "var(--ink)" }}>{h.lemma}</span>
                  <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
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

function Entry({ entry }: { entry: EntryView }) {
  const isNoun = entry.pos === "NOUN" || entry.pos === "ADJECTIVE";
  const isVerb = entry.pos === "VERB";
  const parts = isVerb ? VERB_PARTS : NOUN_PARTS;
  const form = (t: string) => entry.forms.find((f) => f.formType === t)?.value;

  // Ekilex hands over the whole paradigm, so when we have it there is nothing to
  // derive — we show the authoritative forms, including irregular plurals and the
  // parallel forms Estonian genuinely has (raamatutes / raamatuis).
  const retrieved = entry.forms.filter((f) => !f.isPrincipal && f.morphCode);

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
            <h2 lang="et" className="est text-[34px] font-bold leading-none" style={{ color: "var(--ink)" }}>
              {entry.lemma}
            </h2>
            <Speak text={entry.lemma} />
            <Speak text={entry.lemma} slow label={`Hear "${entry.lemma}" slowly`} />
          </div>
          <p className="mt-2 text-[16px]" style={{ color: "var(--ink-2)" }}>{entry.translation}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Chip>{entry.pos.toLowerCase()}</Chip>
            {entry.cefr && <Chip tone="accent">{entry.cefr}</Chip>}
            {entry.gradationNote && (
              <Chip tone="hard" caseSensitive title="Consonant gradation — this is why the stem changes">
                gradation {entry.gradationNote}
              </Chip>
            )}
            {entry.provenance === "AI" && <Chip tone="again">AI — verify</Chip>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <StarButton id={entry.id} />
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

      {entry.notes && (
        <p className="rounded-[var(--r)] px-4 py-3.5 text-[14px]" style={{ background: "var(--raised)", color: "var(--ink-2)" }}>
          {entry.notes}
        </p>
      )}

      {entry.government && (
        <div>
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>
            Government · rektsioon
          </h3>
          <p className="rounded-[var(--r)] px-4 py-3.5 text-[14.5px]" style={{ background: "var(--accent-soft)", color: "var(--accent-deep)" }}>
            {entry.government}
          </p>
        </div>
      )}

      {entry.forms.length > 0 && (
        <div>
          <h3 className="label-xs mb-3" style={{ color: "var(--ink-3)" }}>
            Principal parts — the forms you have to memorise
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
                      <span lang="et" className="est block text-[20px] font-bold" style={{ color: "var(--accent-deep)" }}>{value}</span>
                      <Speak text={value} />
                    </>
                  ) : (
                    <span className="est block text-[19px]" style={{ color: "var(--ink-3)" }}>—</span>
                  )}
                  <span className="label-xs mt-1.5 block" style={{ color: "var(--ink-3)" }}>{label}</span>
                  <span lang="et" className="mt-0.5 block text-[10.5px] italic" style={{ color: "var(--ink-3)" }}>{et}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {retrieved.length > 0 ? (
        <RetrievedParadigm forms={retrieved} />
      ) : isNoun && form("GEN_SG") && (
        <div>
          <h3 className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>
            The rest, worked out from the genitive
          </h3>
          <p className="mb-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
            Learn <Et className="text-[15px]" >{form("GEN_SG")}</Et> and these eleven follow as regular endings.
          </p>
          <div className="overflow-x-auto rounded-[var(--r)] border" style={{ borderColor: "var(--rule)" }}>
            <table className="w-full min-w-[440px] text-[14px]">
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
                      {spec.en}
                      <span lang="et" className="ml-1.5 text-[11.5px] italic" style={{ color: "var(--ink-3)" }}>{spec.et}</span>
                    </td>
                    <td lang="et" className="est px-3 py-2 text-[15px]" style={{ color: origin === "STORED" ? "var(--ink)" : "var(--ink-2)", fontWeight: origin === "STORED" ? 600 : 400 }}>
                      {singular ?? "—"}
                    </td>
                    <td lang="et" className="est px-3 py-2 text-[15px]" style={{ color: "var(--ink-2)" }}>
                      {plural ?? <span style={{ color: "var(--ink-3)" }}>—</span>}
                    </td>
                    <td lang="et" className="px-3 py-2 text-[12.5px]" style={{ color: "var(--ink-3)" }}>{spec.question}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!form("GEN_PL") && (
            <p className="mt-2 text-[12.5px]" style={{ color: "var(--ink-3)" }}>
              Plural forms need the genitive plural, which isn&rsquo;t stored for this word. We leave
              them blank rather than guess — an invented form is worse than a gap.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Ekilex morph codes → the English case name, so an English speaker can scan the table. */
const MORPH_EN: Record<string, string> = {
  SgN: "Nominative", SgG: "Genitive", SgP: "Partitive", SgAdt: "Short illative",
  SgIll: "Illative", SgIn: "Inessive", SgEl: "Elative", SgAll: "Allative",
  SgAd: "Adessive", SgAbl: "Ablative", SgTr: "Translative", SgTer: "Terminative",
  SgEs: "Essive", SgAb: "Abessive", SgKom: "Comitative",
  PlN: "Nominative", PlG: "Genitive", PlP: "Partitive",
  PlIll: "Illative", PlIn: "Inessive", PlEl: "Elative", PlAll: "Allative",
  PlAd: "Adessive", PlAbl: "Ablative", PlTr: "Translative", PlTer: "Terminative",
  PlEs: "Essive", PlAb: "Abessive", PlKom: "Comitative",
  Sup: "ma-infinitive", Inf: "da-infinitive",
  IndPrSg1: "Present 1sg", IndPrSg2: "Present 2sg", IndPrSg3: "Present 3sg",
  IndPrPl1: "Present 1pl", IndPrPl2: "Present 2pl", IndPrPl3: "Present 3pl",
  IndIpfSg1: "Past 1sg", IndIpfSg3: "Past 3sg",
  PtsPtIps: "tud-participle", PtsPtPs: "nud-participle", IndPrIps: "Impersonal present",
};

/** Groups Ekilex's morph codes into the singular / plural / verb blocks a table needs. */
function RetrievedParadigm({ forms }: { forms: EntryForm[] }) {
  const groups: { label: string; test: (code: string) => boolean }[] = [
    { label: "Singular", test: (c) => c.startsWith("Sg") },
    { label: "Plural", test: (c) => c.startsWith("Pl") },
    { label: "Verb forms", test: (c) => !c.startsWith("Sg") && !c.startsWith("Pl") },
  ];

  // Estonian has real parallel forms; collapse them onto one row rather than
  // showing the case twice.
  const merge = (list: EntryForm[]) => {
    const rows = new Map<string, { en: string | null; et: string; values: string[] }>();
    for (const f of list) {
      const key = f.morphCode!;
      const row = rows.get(key) ?? {
        en: MORPH_EN[key] ?? null,
        et: f.morphName ?? key,
        values: [],
      };
      if (!row.values.includes(f.value)) row.values.push(f.value);
      rows.set(key, row);
    }
    return [...rows.values()];
  };

  return (
    <div>
      <h3 className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>
        The full paradigm, from Ekilex
      </h3>
      <p className="mb-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
        These are the authoritative forms, not worked out from a stem — irregular
        plurals and parallel forms included.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(({ label, test }) => {
          const rows = merge(forms.filter((f) => test(f.morphCode!)));
          if (rows.length === 0) return null;
          return (
            <div key={label} className="overflow-hidden rounded-[var(--r)] border" style={{ borderColor: "var(--rule)" }}>
              <div className="label-xs px-3 py-2" style={{ background: "var(--raised)", color: "var(--ink-3)" }}>
                {label}
              </div>
              <ul>
                {rows.map((r) => (
                  <li
                    key={r.et}
                    className="flex items-baseline justify-between gap-3 px-3 py-1.5"
                    style={{ borderTop: "1px solid var(--rule-soft)" }}
                  >
                    <span className="text-[12px]" style={{ color: "var(--ink-2)" }}>
                      {r.en ?? r.et}
                      {r.en && (
                        <span lang="et" className="ml-1.5 text-[11px] italic" style={{ color: "var(--ink-3)" }}>
                          {r.et.replace(/^(ainsuse|mitmuse)\s+/, "")}
                        </span>
                      )}
                    </span>
                    <span lang="et" className="est text-[15px] text-right" style={{ color: "var(--ink)" }}>
                      {r.values.join(" / ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11.5px]" style={{ color: "var(--ink-3)" }}>
        Forms from{" "}
        <a href="https://ekilex.ee" target="_blank" rel="noreferrer" style={{ color: "var(--ink-3)" }}>
          Ekilex
        </a>
        , Institute of the Estonian Language · CC BY 4.0
      </p>
    </div>
  );
}

function StarButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      aria-label="Star this word"
      disabled={pending}
      onClick={() => start(() => void toggleStar(id))}
    >
      <Star size={16} aria-hidden />
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
          <label key={t.type} className="flex cursor-pointer items-start gap-2.5 text-[13.5px]" style={{ color: "var(--ink-2)" }}>
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
              <span className="block text-[12px]" style={{ color: "var(--ink-3)" }}>{t.description}</span>
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
