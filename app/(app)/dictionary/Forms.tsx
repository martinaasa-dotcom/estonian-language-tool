"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { CASES } from "@/lib/estonian/cases";
import { caseFromMorphCode, VERB_GROUP_LABELS, verbSlot, type VerbSlot } from "@/lib/estonian/morph";
import { Speak } from "@/components/Speak";
import { NO_VALUE } from "@/lib/copy/values";

export interface WordForm {
  value: string;
  morphCode: string | null;
  morphName: string | null;
}

/**
 * Every authoritative form, laid out the way they are taught.
 *
 * Ekilex returns sixty-odd forms in one flat list. Printed as a list, that is a
 * wall of Estonian grammar labels; printed as a table, it is the page in the
 * textbook a learner already knows how to read — cases down, singular and
 * plural across; persons down, tenses across. The forms are identical either
 * way. What changes is whether anyone can use them.
 *
 * Anything that does not belong in either table (the quotative, the participles
 * a beginner will not produce) is still shown, behind a disclosure, because
 * hiding a form the dictionary holds would be its own kind of lie.
 */
export function WordForms({ forms, pos }: { forms: WordForm[]; pos: string }) {
  const isVerb = pos === "VERB";
  return (
    <div>
      <h3 className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>
        Every form, from Ekilex
      </h3>
      <p className="mb-3 text-xs" style={{ color: "var(--ink-3)" }}>
        These are the authoritative forms, not worked out from a stem, irregular plurals and the
        parallel forms Estonian really has, included.
      </p>
      {isVerb ? <VerbTable forms={forms} /> : <CaseTable forms={forms} />}
      <p className="mt-3 text-2xs" style={{ color: "var(--ink-3)" }}>
        Forms from{" "}
        <a href="https://ekilex.ee" target="_blank" rel="noreferrer" style={{ color: "var(--ink-3)" }}>
          Ekilex
        </a>
        , Institute of the Estonian Language · CC BY 4.0
      </p>
    </div>
  );
}

/** Collapses the parallel forms Estonian genuinely has onto one cell. */
function valuesFor(forms: WordForm[], code: string): string[] {
  const out: string[] = [];
  for (const f of forms) {
    if (f.morphCode !== code) continue;
    if (!out.includes(f.value)) out.push(f.value);
  }
  return out;
}

function Cell({ values }: { values: string[] }) {
  if (values.length === 0) {
    return <span style={{ color: "var(--ink-3)" }}>{NO_VALUE}</span>;
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span lang="et" className="text-base" style={{ color: "var(--ink)" }}>
        {values.join(" / ")}
      </span>
      <Speak text={values[0]!} size={13} />
    </span>
  );
}

/** Cases down, singular and plural across — the shape of every Estonian noun table. */
function CaseTable({ forms }: { forms: WordForm[] }) {
  const singular: Record<string, string> = {};
  const plural: Record<string, string> = {};
  for (const spec of CASES) {
    for (const f of forms) {
      if (caseFromMorphCode(f.morphCode) !== spec.key) continue;
      if (f.morphCode?.startsWith("Sg")) singular[spec.key] = f.morphCode;
      if (f.morphCode?.startsWith("Pl")) plural[spec.key] = f.morphCode;
    }
  }

  const rows = CASES.filter((c) => singular[c.key] || plural[c.key]);
  if (rows.length === 0) return <OtherForms forms={forms} used={new Set()} />;

  const used = new Set([...Object.values(singular), ...Object.values(plural)]);
  // The short illative is a separate code on the same case; show it in its own row.
  const shortIllative = valuesFor(forms, "SgAdt");
  if (shortIllative.length > 0) used.add("SgAdt");

  return (
    <>
      <div className="overflow-x-auto rounded-[var(--r-lg)] border" style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
        <table className="w-full min-w-[420px] text-sm">
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
            {rows.map((spec) => (
              <tr key={spec.key} style={{ borderTop: "1px solid var(--rule-soft)" }}>
                <td className="px-3 py-2" style={{ color: "var(--ink-2)" }}>
                  {/* The case name is the way into the reference page: this table
                      says what the form is, that page says when to use it. The
                      Estonian name leads because that is the one a course, a
                      textbook and the state examination all use; the Latin one
                      is kept small for anyone reading an English grammar. */}
                  <Link href={`/grammar/${spec.key.toLowerCase()}`} lang="et" className="hover:underline">
                    {spec.et}
                  </Link>
                  <span className="ml-1.5 text-2xs italic" style={{ color: "var(--ink-3)" }}>
                    {spec.en.toLowerCase()}
                  </span>
                </td>
                <td className="px-3 py-2"><Cell values={singular[spec.key] ? valuesFor(forms, singular[spec.key]!) : []} /></td>
                <td className="px-3 py-2"><Cell values={plural[spec.key] ? valuesFor(forms, plural[spec.key]!) : []} /></td>
                <td lang="et" className="px-3 py-2 text-xs" style={{ color: "var(--ink-3)" }}>{spec.question}</td>
              </tr>
            ))}
            {shortIllative.length > 0 && (
              <tr style={{ borderTop: "1px solid var(--rule-soft)" }}>
                <td className="px-3 py-2" style={{ color: "var(--ink-2)" }}>
                  <span lang="et">lühike sisseütlev</span>
                  <span className="ml-1.5 text-2xs italic" style={{ color: "var(--ink-3)" }}>
                    short illative
                  </span>
                </td>
                <td className="px-3 py-2"><Cell values={shortIllative} /></td>
                <td className="px-3 py-2"><span style={{ color: "var(--ink-3)" }}>{NO_VALUE}</span></td>
                <td lang="et" className="px-3 py-2 text-xs" style={{ color: "var(--ink-3)" }}>kuhu?</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <OtherForms forms={forms} used={used} />
    </>
  );
}

const PERSONS = [
  { order: 1, et: "ma" }, { order: 2, et: "sa" }, { order: 3, et: "ta" },
  { order: 4, et: "me" }, { order: 5, et: "te" }, { order: 6, et: "nad" },
];

const FINITE_GROUPS: VerbSlot["group"][] = ["PRESENT", "PAST", "CONDITIONAL"];

/** Persons down, tenses across — how a verb is actually recited. */
function VerbTable({ forms }: { forms: WordForm[] }) {
  const slotted = forms
    .map((f) => ({ form: f, slot: verbSlot(f.morphCode) }))
    .filter((x): x is { form: WordForm; slot: VerbSlot } => x.slot !== null);

  const used = new Set(slotted.map((x) => x.form.morphCode!));
  const groups = FINITE_GROUPS.filter((g) => slotted.some((x) => x.slot.group === g));
  const nonFinite = slotted.filter((x) => x.slot.group === "NON_FINITE" || x.slot.group === "IMPERATIVE");

  return (
    <>
      {groups.length > 0 && (
        <div className="overflow-x-auto rounded-[var(--r-lg)] border" style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}>
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr>
                <th className="label-xs px-3 py-2.5 text-left" style={{ background: "var(--raised)", color: "var(--ink-3)" }}>
                  Person
                </th>
                {groups.map((g) => (
                  <th key={g} className="label-xs px-3 py-2.5 text-left" style={{ background: "var(--raised)", color: "var(--ink-3)" }}>
                    <span lang="et">{VERB_GROUP_LABELS[g].et}</span>
                    <span className="ml-1.5 font-normal normal-case italic" style={{ letterSpacing: 0 }}>
                      {VERB_GROUP_LABELS[g].en.toLowerCase()}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERSONS.map((person) => (
                <tr key={person.order} style={{ borderTop: "1px solid var(--rule-soft)" }}>
                  <td lang="et" className="px-3 py-2 text-sm" style={{ color: "var(--ink-2)" }}>{person.et}</td>
                  {groups.map((g) => {
                    const match = slotted.find((x) => x.slot.group === g && x.slot.order === person.order);
                    return (
                      <td key={g} className="px-3 py-2">
                        <Cell values={match ? valuesFor(forms, match.form.morphCode!) : []} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Loose tiles rather than a second table: these forms share no axis, and
          a grid leaves an empty block of cells on the last row. */}
      {nonFinite.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {nonFinite.map(({ form, slot }) => (
            <div
              key={form.morphCode}
              className="min-w-[132px] flex-1 rounded-[var(--r)] px-3 py-2.5"
              style={{ background: "var(--raised)" }}
            >
              <Cell values={valuesFor(forms, form.morphCode!)} />
              <span className="label-xs mt-1 block" style={{ color: "var(--ink-3)" }}>{slot.en}</span>
            </div>
          ))}
        </div>
      )}

      <OtherForms forms={forms} used={used} />
    </>
  );
}

/**
 * Everything the tables above did not place.
 *
 * Behind a disclosure rather than deleted: these are real forms Ekilex holds,
 * and someone at C1 looking for the quotative should be able to find it.
 */
function OtherForms({ forms, used }: { forms: WordForm[]; used: Set<string> }) {
  const [open, setOpen] = useState(false);
  const rest: { code: string; name: string; values: string[] }[] = [];
  for (const f of forms) {
    if (!f.morphCode || used.has(f.morphCode)) continue;
    const held = rest.find((r) => r.code === f.morphCode);
    if (held) { if (!held.values.includes(f.value)) held.values.push(f.value); continue; }
    rest.push({ code: f.morphCode, name: f.morphName ?? f.morphCode, values: [f.value] });
  }
  if (rest.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs"
        style={{ color: "var(--accent-deep)" }}
      >
        <ChevronDown
          size={13}
          aria-hidden
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
        />
        {open ? "Hide" : "Show"} the other {rest.length} form{rest.length === 1 ? "" : "s"} Ekilex holds
      </button>
      {open && (
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {rest.map((r) => (
            <li key={r.code} className="flex items-baseline justify-between gap-3 text-xs">
              <span lang="et" style={{ color: "var(--ink-3)" }}>{r.name}</span>
              <span lang="et" className="text-sm" style={{ color: "var(--ink-2)" }}>
                {r.values.join(" / ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
