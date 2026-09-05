import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { TriangleAlert } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { exceptionGroups, exceptionScale } from "@/lib/progress/exceptions";
import { FAMILY_TITLES, KIND_NOTES, type ExceptionFamily } from "@/lib/estonian/exceptions";
import { DrillLink } from "@/components/DrillLink";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Empty, Page, SectionTitle, Stack } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Exceptions · the words the endings do not reach",
  description:
    "Where the three principal parts and eleven endings stop being predictable, grouped by what breaks and drawn from the dictionary rather than written by hand.",
};

/**
 * THE PAGE THAT SAYS HOW FAR TO TRUST THE PATTERN.
 *
 * `/grammar` opens with "three you memorise, and eleven you can work out",
 * which is true and is the most motivating fact a beginner is given. What no
 * screen said is where it stops: `caseAnswer` prefers an attested form over the
 * rule, so a learner meets `tuppa` printed under a heading that taught them
 * `sse` and has no way to know which of the two facts is the one to reach for
 * tomorrow. That is worse than not knowing, because the pattern is presented as
 * more reliable than it is.
 *
 * Nothing on this page is a list somebody typed. `lib/estonian/exceptions.ts`
 * states the pattern per slot and reports the words whose stored form disagrees,
 * so the page is a reading of the dictionary and cannot drift from it. The
 * counts are counted for the same reason: a number written into a paragraph is
 * a number nobody re-measures, and the whole argument here is a proportion.
 *
 * BANDED, because the value of this area is that it is small. A learner at A1
 * has no use for the polite imperative of a C1 verb, and the whole set is a
 * click away on each kind's own page.
 */
export default async function ExceptionsPage() {
  const ownerId = await requireUserId();
  const level = await courseLevelFor(ownerId);
  const [groups, scale] = await Promise.all([exceptionGroups(level), exceptionScale()]);

  const live = groups.filter((g) => g.entries.length > 0);
  const families = [...new Set(live.map((g) => g.family))] as ExceptionFamily[];

  return (
    <Page
      eyebrow="Reference"
      title="Exceptions"
      lead="Where the endings stop being predictable, and which words to learn one at a time."
    >
      <Stack>
        <Card tone="butter">
          <div className="flex items-start gap-3">
            <TriangleAlert size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--butter-ink)" }} />
            <div className="min-w-0">
              <p className="text-lg font-bold" style={{ color: "var(--ink)" }}>
                Most words follow the pattern. These do not.
              </p>
              <p className="mt-2 max-w-[62ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Learn the genitive and eleven cases follow. That holds until the stem itself moves,
                and then it stops holding for every case at once. {scale} graded words in this
                dictionary break a pattern somewhere, and this is which ones and where.
              </p>
              <p className="mt-2 max-w-[62ch] text-sm" style={{ color: "var(--ink-3)" }}>
                A word that is not here can be guessed at. That is what the area is for.
              </p>
            </div>
          </div>
        </Card>

        {live.length === 0 ? (
          <Empty
            title="Nothing to show yet"
            body="The dictionary has no graded words near your level to compare against the pattern."
            action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
          />
        ) : (
          families.map((family) => (
            <section key={family}>
              <SectionTitle hint={`at ${level}`}>{FAMILY_TITLES[family]}</SectionTitle>
              <ul className="grid gap-3 sm:grid-cols-2">
                {live.filter((g) => g.family === family).map((group) => {
                  const note = KIND_NOTES[group.kind];
                  // The first few words, as they stand in the dictionary. A
                  // count with no words under it is a claim a reader cannot
                  // check on the screen they are already looking at.
                  const sample = group.entries.slice(0, 3);
                  return (
                    <li key={group.kind}>
                      <Link
                        href={`/grammar/exceptions/${group.kind.toLowerCase()}`}
                        className="lift flex h-full flex-col gap-2 rounded-[var(--r-lg)] border p-4"
                        style={{
                          borderColor: "var(--rule)",
                          background: "var(--surface)",
                          boxShadow: "var(--shadow-sm)",
                        }}
                      >
                        <span className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-md font-bold" style={{ color: "var(--ink)" }}>
                            {note.title}
                          </span>
                          <Chip tone="accent">{group.entries.length} near you</Chip>
                        </span>
                        <span className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                          {note.what}
                        </span>
                        <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                          {sample.map((entry) => (
                            <span key={entry.id} lang="et">{entry.lemma}</span>
                          ))}
                          <span>{group.everywhere} in the dictionary</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}

        <section>
          <SectionTitle>Drill them</SectionTitle>
          <DrillLink href="/review/exceptions" />
        </section>
      </Stack>
    </Page>
  );
}
