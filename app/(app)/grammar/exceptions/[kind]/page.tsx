import { notFound } from "next/navigation";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ButtonLink } from "@/components/Button";
import { requireUserId } from "@/lib/auth/session";
import { courseLevelFor } from "@/lib/progress/level";
import { exceptionGroup } from "@/lib/progress/exceptions";
import { EXCEPTION_KINDS, FAMILY_TITLES, KIND_NOTES } from "@/lib/estonian/exceptions";
import { ExceptionNote } from "@/components/WordExceptions";
import { DrillLink } from "@/components/DrillLink";
import { Card, Chip, Empty, Page, SectionTitle, Stack } from "@/components/ui";
import { sameSpelling, SAME_SPELLING } from "@/lib/copy/values";

export const dynamic = "force-dynamic";

/** The URL is the kind in lower case, the way a case page is. */
function kindFrom(slug: string) {
  const upper = slug.toUpperCase();
  return (EXCEPTION_KINDS as readonly string[]).includes(upper) ? upper : null;
}

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const key = kindFrom(kind);
  if (!key) return { title: "Exceptions" };
  const note = KIND_NOTES[key as keyof typeof KIND_NOTES];
  return { title: `${note.title} · exceptions`, description: note.what };
}

/**
 * One kind of exception, with every word near the learner that has it.
 *
 * A list rather than a drill, because reading what is on a list and working
 * through it are two different things and this app already draws that line
 * between `/dictionary/common` and `/review/common`. The drill is one press
 * away at the bottom, and the round it opens is filtered to this kind.
 *
 * Each row is the word, its meaning, the form the pattern does not give, and
 * the slot named the way a class names it. `ExceptionNote` is the one drawing
 * of that, shared with the dictionary entry, so a word explained here and the
 * same word explained on its own page cannot say two different things.
 */
export default async function ExceptionKindPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const key = kindFrom(kind);
  if (!key) notFound();

  const ownerId = await requireUserId();
  const level = await courseLevelFor(ownerId);
  const group = await exceptionGroup(key, level);
  if (!group) notFound();

  const note = KIND_NOTES[group.kind];

  return (
    <Page
      eyebrow={FAMILY_TITLES[group.family]}
      title={note.title}
      lead={note.what}
    >
      <Stack>
        <Card tone="butter">
          <p className="max-w-[62ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            {group.entries.length} of these are near your level, and {group.everywhere} are in the
            dictionary. Every one was found by comparing the pattern with the form a lexicographer
            wrote down, so this list follows the dictionary rather than a list somebody typed.
          </p>
        </Card>

        {group.entries.length === 0 ? (
          <Empty
            title="None near your level"
            body="This one turns up in words above or below where you are working."
            action={<ButtonLink href="/grammar/exceptions" variant="primary">Back to the exceptions</ButtonLink>}
          />
        ) : (
          <section>
            <SectionTitle hint={`${group.entries.length} words`}>Learn these one at a time</SectionTitle>
            <ul className="flex flex-col gap-3">
              {group.entries.map((entry) => {
                const exception = entry.exceptions.find((e) => e.kind === group.kind);
                if (!exception) return null;
                return (
                  <li key={entry.id}>
                    <Card>
                      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                        <Link
                          href={`/dictionary?q=${encodeURIComponent(entry.lemma)}`}
                          className="tap-tint flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-[var(--r-sm)] px-1"
                        >
                          <span lang="et" className="text-xl font-bold" style={{ color: "var(--ink)" }}>
                            {entry.lemma}
                          </span>
                          <span className="text-sm" style={{ color: "var(--ink-2)" }}>
                            {sameSpelling(entry.lemma, entry.translation) ? SAME_SPELLING : entry.translation}
                          </span>
                        </Link>
                        <span className="flex flex-wrap gap-1.5">
                          <Chip>{entry.pos.toLowerCase()}</Chip>
                          {entry.cefr && <Chip tone="accent">{entry.cefr}</Chip>}
                        </span>
                      </div>
                      <div className="mt-3">
                        <ExceptionNote exception={exception} />
                      </div>
                      {/*
                        The rest of what this word does, where it does more than
                        one thing. `aeg` breaks four patterns and a page about
                        one of them that says nothing about the other three
                        sends somebody away with a quarter of the word.
                      */}
                      {entry.exceptions.length > 1 && (
                        <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                          This word also breaks{" "}
                          {entry.exceptions
                            .filter((e) => e.kind !== group.kind)
                            .map((e) => KIND_NOTES[e.kind].title.toLowerCase())
                            .join(", ")}
                          .
                        </p>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section>
          <SectionTitle>Drill them</SectionTitle>
          <DrillLink href="/review/exceptions" />
        </section>
      </Stack>
    </Page>
  );
}
