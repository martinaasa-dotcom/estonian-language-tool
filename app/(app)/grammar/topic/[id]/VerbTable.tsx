import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Chip } from "@/components/ui";
import { Speak } from "@/components/Speak";
import type { VerbExample, VerbExampleForm } from "@/lib/progress/verbExamples";
import { NO_VALUE } from "@/lib/copy/values";

/**
 * Real verbs, conjugated for the point the page is about.
 *
 * Every form carries where it came from, the way the case page's do: Ekilex,
 * the stored first person, or the regular ending on it. A reader deserves to
 * know which of those they are looking at, and the chip in the last column
 * says which applies to the row, since a verb's forms all come from the same
 * place.
 */
const PERSONS: readonly { code: string; label: string }[] = [
  { code: "Sg1", label: "ma" }, { code: "Sg2", label: "sa" }, { code: "Sg3", label: "ta" },
  { code: "Pl1", label: "me" }, { code: "Pl2", label: "te" }, { code: "Pl3", label: "nad" },
];

const ORIGIN: Record<VerbExampleForm["origin"], { label: string; title: string }> = {
  EKILEX: { label: "Ekilex", title: "As the Institute of the Estonian Language records it" },
  STORED: { label: "memorized", title: "The stored first person, a principal part" },
  DERIVED: {
    label: "derived",
    title: "The regular ending on the stored first person, checked against Ekilex for every verb here",
  },
};

function pick(v: VerbExample, code: string): VerbExampleForm | undefined {
  return v.forms.find((f) => f.code === code);
}

/** The provenance the row as a whole can claim: Ekilex only if every form shown is Ekilex's. */
function rowOrigin(forms: (VerbExampleForm | undefined)[]): VerbExampleForm["origin"] {
  const present = forms.filter((f): f is VerbExampleForm => f !== undefined);
  if (present.length > 0 && present.every((f) => f.origin === "EKILEX")) return "EKILEX";
  if (present.some((f) => f.origin === "DERIVED")) return "DERIVED";
  return "STORED";
}

function Form({ form, bold }: { form: VerbExampleForm | undefined; bold?: boolean }) {
  if (!form) return <span style={{ color: "var(--ink-3)" }}>{NO_VALUE}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        lang="et"
        className={bold ? "text-base font-semibold" : "text-base"}
        style={{ color: bold ? "var(--accent-deep)" : "var(--ink)" }}
      >
        {form.value}
      </span>
      <Speak text={form.value} size={13} />
    </span>
  );
}

function Head({ verb }: { verb: VerbExample }) {
  return (
    <td className="px-3 py-2.5">
      <Link href={`/dictionary?q=${encodeURIComponent(verb.lemma)}`} className="hover:underline">
        <span lang="et" className="text-base" style={{ color: "var(--ink)" }}>{verb.lemma}</span>
      </Link>
      <span className="block text-xs" style={{ color: "var(--ink-3)" }}>{verb.translation}</span>
    </td>
  );
}

function From({ origin }: { origin: VerbExampleForm["origin"] }) {
  return (
    <td className="px-3 py-2.5">
      <Chip tone={origin === "DERIVED" ? "neutral" : "sky"} title={ORIGIN[origin].title}>
        {ORIGIN[origin].label}
      </Chip>
    </td>
  );
}

export function VerbTable({ verbs, show }: {
  verbs: readonly VerbExample[];
  show: "present" | "negative" | "conditional" | "imperative";
}) {
  const prefix = show === "conditional" ? "KndPr" : "IndPr";
  const persons = show === "present" || show === "conditional";

  const headers = persons
    ? ["Verb", ...PERSONS.map((p) => p.label), "From"]
    : show === "negative"
      ? ["Verb", "olevik · ma", "eitus", "From"]
      : ["Verb", "olevik · ma", "käskiv kõneviis · sa", "From"];

  return (
    <div
      className="overflow-x-auto rounded-[var(--r-lg)] border"
      style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
    >
      <table className={`w-full text-sm ${persons ? "min-w-[640px]" : "min-w-[460px]"}`}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th
                key={h}
                lang={h === "Verb" || h === "From" ? undefined : "et"}
                className="label-xs px-3 py-2.5 text-left"
                style={{ background: "var(--raised)", color: "var(--ink-3)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {verbs.map((verb) => {
            if (persons) {
              const cells = PERSONS.map((p) => pick(verb, `${prefix}${p.code === "Sg3" && prefix === "KndPr" ? "Ps" : p.code}`));
              return (
                <tr key={verb.lexemeId} style={{ borderTop: "1px solid var(--rule-soft)" }}>
                  <Head verb={verb} />
                  {cells.map((form, i) => (
                    <td key={PERSONS[i]!.code} className="px-3 py-2.5">
                      <Form form={form} bold={form?.origin === "STORED"} />
                    </td>
                  ))}
                  <From origin={rowOrigin(cells)} />
                </tr>
              );
            }
            const first = pick(verb, "IndPrSg1");
            const other = pick(verb, show === "negative" ? "IndPrPs_" : "ImpPrSg2");
            const shown: VerbExampleForm | undefined = other && show === "negative"
              ? { ...other, value: `ei ${other.value}` }
              : other && { ...other, value: `${other.value}!` };
            return (
              <tr key={verb.lexemeId} style={{ borderTop: "1px solid var(--rule-soft)" }}>
                <Head verb={verb} />
                <td className="px-3 py-2.5"><Form form={first} bold /></td>
                <td className="px-3 py-2.5"><Form form={shown} /></td>
                <From origin={rowOrigin([first, other])} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
