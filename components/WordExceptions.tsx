import { Chip } from "@/components/ui";
import { KIND_NOTES, type WordException } from "@/lib/estonian/exceptions";
import { plainAskLine } from "@/lib/estonian/plainAsk";
import { slotLabel } from "@/lib/srs/slots";

/**
 * WHERE ONE WORD DEPARTS FROM THE PATTERN, ON THE ENTRY FOR THAT WORD.
 *
 * The dictionary printed `tuppa` in the illative row of a table headed "the
 * rest, worked out from the genitive" and said nothing about the two facts
 * being in tension. A learner reading that page comes away with the ending
 * `sse` and a form that does not have it, and no way to know which of the two
 * to reach for tomorrow.
 *
 * A WORD CAN BREAK MORE THAN ONE PATTERN AND EACH ONE IS ITS OWN ROW. `aeg` has
 * four: the stem, the partitive, the short illative and the plural. Rolling
 * those into one sentence is what the gradation chip already did, and it is why
 * that chip taught nobody anything: "gradation g : j" is true, sits above a
 * table with four surprises in it, and points at none of them.
 *
 * WHAT IS PRINTED IS ALWAYS A FORM THE DICTIONARY VOUCHES FOR. The pattern's own
 * answer appears only where it is also a real word, which is the illative and
 * nothing else: `toasse` is correct Estonian and is accepted everywhere the
 * short form is shown, and the partitive the ending rule would build for `aeg`
 * is not a word at all. Printing one with a line through it would be this app
 * writing Estonian and hoping nobody memorised it (ADR-005).
 *
 * The slot's Estonian name and the question it answers lead, and the plain
 * clause from `lib/estonian/plainAsk.ts` sits under it, which is the order
 * every card in the app takes since a learner reported that a name they cannot
 * cash in is furniture.
 */
export function WordExceptions({ exceptions }: { exceptions: readonly WordException[] }) {
  if (exceptions.length === 0) return null;

  return (
    <div>
      <h3 className="label-xs mb-1" style={{ color: "var(--ink-3)" }}>
        Where this word breaks the pattern
      </h3>
      <p className="mb-3 text-xs" style={{ color: "var(--ink-3)" }}>
        {exceptions.length === 1
          ? "One form here is not what the endings would give you."
          : `${exceptions.length} forms here are not what the endings would give you.`}
      </p>
      <ul className="flex flex-col gap-2">
        {exceptions.map((ex) => (
          <li key={`${ex.kind}-${ex.slot}`}>
            <ExceptionNote exception={ex} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One departure: what it is called, what the form is, and what to do with it. */
export function ExceptionNote({ exception: ex }: { exception: WordException }) {
  const note = KIND_NOTES[ex.kind];
  const ask = plainAskLine(ex.slot);

  return (
    <div
      className="rounded-[var(--r)] border px-4 py-3"
      style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        {ex.forms.length > 0 ? (
          ex.forms.map((value) => (
            <span key={value} lang="et" className="text-lg font-bold" style={{ color: "var(--accent-deep)" }}>
              {value}
            </span>
          ))
        ) : (
          <span className="text-md font-bold" style={{ color: "var(--ink)" }}>{note.title}</span>
        )}
        <span lang="et" className="text-xs" style={{ color: "var(--ink-3)" }}>
          {slotLabel(ex.slot)}
        </span>
        {ex.note && (
          <Chip tone="hard" caseSensitive>{ex.note}</Chip>
        )}
      </div>

      {ask && (
        <p className="mt-1 text-xs" style={{ color: "var(--ink-3)" }}>{ask}</p>
      )}

      <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {note.what}
      </p>

      {/*
        The other form, where there genuinely is one. Both illatives are
        Estonian, a course teaches them as a pair, and the marker takes either,
        so hiding one is the fault this whole area exists to name, pointed the
        other way.
      */}
      {ex.ruleFormIsAlsoRight && ex.ruleForm && (
        <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
          <span lang="et">{ex.ruleForm}</span> is right too, and is what the ending gives you.
        </p>
      )}
    </div>
  );
}
