import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Sparkles, Target } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { oneEntryPerLemma } from "@/lib/dict/search";
import { DEMO_STEMS } from "@/lib/collections/demoWords";
import { buildCaseTable, shownForms, stemsFrom } from "@/lib/estonian/derive";
import {
  CASE_GROUPS, TOPIC_GROUPS, TOPIC_NOTES, caseReference, grammarTopic, groupEndings,
} from "@/lib/estonian/grammar";
import { VERB_AXES, grammarGroupTerm, grammarTerm } from "@/lib/estonian/terms";
import { caseAccuracy } from "@/lib/stats/history";
import { caseReviewsFor } from "@/lib/progress/cases";
import { Card, Chip, Meter, Note, Page, SectionTitle, Stack } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Grammar · the endings, and what each one means",
  description:
    "Fourteen endings in plain English, each with its Estonian name and the question it answers, shown on real words from the dictionary.",
};

/**
 * The reference layer.
 *
 * Every other screen in the app tests. This one explains, which is the half a
 * flashcard app usually leaves to a textbook the learner does not own.
 *
 * WHAT LEADS IS THE ENDING. A learner mid-sentence is not looking for the
 * inessive, they are looking for -s, and the version of this page that led
 * with fourteen Latin names asked them to decode a heading before they could
 * read the line under it. So each card is the ending, then the English word it
 * means, then one line on what it does, and the two names a course and a
 * reference grammar use sit under that as the cross-reference they are.
 *
 * The strip at the top is the argument in one object: one real word out of the
 * dictionary, wearing every ending. Nothing on it is written here.
 */
export default async function GrammarIndexPage() {
  const ownerId = await requireUserId();

  const [reviews, demo] = await Promise.all([
    // Through the one reader, so this page and Practice and Progress cannot
    // name three different weakest cases at the same learner. See
    // lib/progress/cases.ts.
    caseReviewsFor(ownerId),
    endingStrip(),
  ]);
  const weakest = caseAccuracy(reviews).slice(0, 3);

  return (
    <Page
      eyebrow="Reference"
      title="Grammar"
      lead="Fourteen endings. Three you memorize, and eleven you can work out."
    >
      <Stack>
        <Card tone="accent">
          <div className="flex items-start gap-3">
            <Sparkles size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent-deep)" }} />
            <div className="min-w-0">
              <p className="text-lg font-bold" style={{ color: "var(--ink)" }}>
                One word, eleven endings
              </p>
              <p className="mt-2 max-w-[60ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Three forms of a word are memorized. Every other case is one of those three with an
                ending stuck on, and it is the same ending for every word in the language.
              </p>
              {demo && (
                <ul className="mt-4 flex flex-wrap gap-1.5">
                  {demo.forms.map((row) => (
                    <li
                      key={row.suffix}
                      className="rounded-[var(--r-sm)] px-2 py-1"
                      style={{ background: "var(--surface)" }}
                    >
                      <span lang="et" className="text-sm" style={{ color: "var(--ink-2)" }}>
                        {row.stem}
                      </span>
                      <span lang="et" className="text-sm font-bold" style={{ color: "var(--accent-deep)" }}>
                        {row.suffix}
                      </span>
                      <span className="ml-1.5 text-xs" style={{ color: "var(--ink-3)" }}>
                        {row.plain}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>

        {weakest.length > 0 && (
          <section>
            <SectionTitle hint="from your own reviews">Start with these</SectionTitle>
            <Card>
              <ul className="flex flex-col gap-2">
                {weakest.map((c) => {
                  const ref = caseReference(c.grammCase);
                  if (!ref) return null;
                  return (
                    <li key={c.grammCase}>
                      <Link
                        href={`/grammar/${c.grammCase.toLowerCase()}`}
                        className="tap-tint flex flex-col gap-1.5 rounded-[var(--r)] px-2 py-2"
                      >
                        {/* Two lines rather than one row, because on a phone
                            the one row put the meter under the label and the
                            figure under the meter, which read as three rows
                            with nothing lining up. */}
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="flex min-w-0 items-baseline gap-2 text-sm">
                            <Target size={15} aria-hidden className="self-center" style={{ color: "var(--ink-3)" }} />
                            {!ref.spec.principal && (
                              <span lang="et" className="font-semibold" style={{ color: "var(--accent-deep)" }}>
                                -{ref.spec.suffix}
                              </span>
                            )}
                            <span className="font-semibold" style={{ color: "var(--ink)" }}>{ref.plain}</span>
                            <span lang="et" className="text-xs" style={{ color: "var(--ink-3)" }}>
                              {ref.spec.et}
                            </span>
                          </span>
                          <span className="tnum shrink-0 text-xs" style={{ color: "var(--ink-3)" }}>
                            {c.accuracy}% over {c.total}
                          </span>
                        </span>
                        <span className="block max-w-[320px]">
                          <Meter
                            pct={c.accuracy}
                            label={`${ref.spec.et} accuracy`}
                            tone={c.accuracy >= 85 ? "var(--good)" : c.accuracy >= 65 ? "var(--hard)" : "var(--again)"}
                            height={5}
                          />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        )}

        {CASE_GROUPS.map((group) => {
          // Empty for the three that have no ending, and an empty hint is no
          // hint rather than an empty span sitting in the heading row.
          const endings = groupEndings(group);
          return (
          <section key={group.title}>
            <SectionTitle
              hint={endings.length > 0 ? (
                // As written, for the reason the case page's eyebrow is: a
                // heading is uppercased and an ending is not a label.
                <span lang="et" style={{ textTransform: "none" }}>{endings.join(" · ")}</span>
              ) : undefined}
            >
              {group.title}
            </SectionTitle>
            <p className="mb-3 max-w-[68ch] text-sm" style={{ color: "var(--ink-2)" }}>
              {group.blurb}
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {group.keys.map((key) => {
                const ref = caseReference(key);
                if (!ref) return null;
                return (
                  <li key={key}>
                    <Link
                      href={`/grammar/${key.toLowerCase()}`}
                      className="lift flex h-full flex-col gap-2 rounded-[var(--r-lg)] border p-4"
                      style={{
                        borderColor: "var(--rule)",
                        background: "var(--surface)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                    >
                      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        {ref.spec.principal ? (
                          <Chip tone="hard">memorized</Chip>
                        ) : (
                          <span lang="et" className="text-xl font-bold" style={{ color: "var(--accent-deep)" }}>
                            -{ref.spec.suffix}
                          </span>
                        )}
                        <span className="text-md font-bold" style={{ color: "var(--ink)" }}>
                          {ref.plain}
                        </span>
                      </span>
                      <span className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                        {ref.summary}
                      </span>
                      {/* The two names, quietly, under the thing they name.
                          A class says the first and an English reference
                          grammar says the second, so both have to be findable
                          and neither has any business being the headline. */}
                      <span className="mt-auto pt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                        <span lang="et">{ref.spec.et}</span>
                        {" · "}
                        <span lang="et">{ref.spec.question}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          );
        })}

        <Card tone="butter">
          <p className="text-lg font-bold" style={{ color: "var(--ink)" }}>
            The verb has two tenses, not six
          </p>
          <p className="mt-2 max-w-[64ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            Two more are built with a helper verb. Mood, voice and person are separate switches
            crossing all four, so a form is named by saying where it sits on each.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {VERB_AXES.map((axis) => (
              <div key={axis.et} className="min-w-0 rounded-[var(--r-sm)] p-3" style={{ background: "var(--surface)" }}>
                <dt className="flex flex-wrap items-baseline gap-2">
                  <span className="text-md font-bold" style={{ color: "var(--ink)" }}>
                    {axis.en}
                  </span>
                  <span lang="et" className="text-xs" style={{ color: "var(--ink-3)" }}>{axis.et}</span>
                </dt>
                <dd className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {axis.blurb}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <section>
          <SectionTitle hint={`${TOPIC_NOTES.length} points`}>Beyond the endings</SectionTitle>
          <p className="mt-1 max-w-[68ch] text-sm" style={{ color: "var(--ink-2)" }}>
            Sorted by what kind of word is doing the work, which is how a course orders them.
          </p>
          <div className="mt-4 flex flex-col gap-6">
            {TOPIC_GROUPS.map((group) => {
              const groupTerm = grammarGroupTerm(group.id);
              return (
                <div key={group.id}>
                  <h3 className="flex flex-wrap items-baseline gap-2">
                    <span className="text-md font-bold" style={{ color: "var(--ink)" }}>{group.title}</span>
                    {groupTerm && (
                      <span lang="et" className="text-xs" style={{ color: "var(--ink-3)" }}>
                        {groupTerm}
                      </span>
                    )}
                  </h3>
                  <p className="mt-1 max-w-[68ch] text-sm" style={{ color: "var(--ink-3)" }}>
                    {group.blurb}
                  </p>
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {group.ids.map((id) => {
                      const topic = grammarTopic(id);
                      if (!topic) return null;
                      const term = grammarTerm(id);
                      return (
                        <li key={id}>
                          <Link
                            href={`/grammar/topic/${id}`}
                            className="lift flex h-full flex-col gap-1.5 rounded-[var(--r-lg)] border p-4"
                            style={{
                              borderColor: "var(--rule)",
                              background: "var(--surface)",
                              boxShadow: "var(--shadow-sm)",
                            }}
                          >
                            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <span className="text-md font-bold" style={{ color: "var(--ink)" }}>
                                {topic.title}
                              </span>
                              {topic.marker && (
                                <span className="ml-auto">
                                  <Chip tone="accent" caseSensitive>{topic.marker}</Chip>
                                </span>
                              )}
                            </span>
                            <span className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                              {topic.summary}
                            </span>
                            {term && (
                              <span className="mt-auto pt-1 text-xs" style={{ color: "var(--ink-3)" }}>
                                <span lang="et">{term.et}</span>
                                {term.question && <> · <span lang="et">{term.question}</span></>}
                              </span>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        <Note tone="neutral">
          Endings go on the genitive singular for the singular column and the genitive plural for
          the plural one. Where the dictionary has no genitive plural, a case table shows a gap
          rather than a guess.
        </Note>

        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          Still stuck on one?{" "}
          <Link href="/tutor" className="underline" style={{ color: "var(--accent-deep)" }}>
            Ask Anu
          </Link>{" "}
          to name the rule behind a sentence you wrote.
        </p>
      </Stack>
    </Page>
  );
}

interface StripRow {
  /** Everything before the ending, so the ending can be picked out in color. */
  readonly stem: string;
  readonly suffix: string;
  /** What the ending means, from `CASE_NOTES`. */
  readonly plain: string;
}

/**
 * One real word wearing every ending, for the card at the top.
 *
 * The claim that card makes is that eleven cases are arithmetic, and a claim
 * like that is worth more shown than asserted. Nothing here is written: the
 * word comes out of the dictionary and the forms come from `buildCaseTable`,
 * which is the same function the dictionary entry and the landing page use.
 * A deployment whose database is unreachable falls back to the checked seed
 * stems, exactly as the landing page does, so the card never renders empty.
 *
 * The word is the regular one on purpose. `tuba` would be a better argument
 * about stems changing and a worse picture of an ending, and this card is
 * about the ending.
 */
async function endingStrip(): Promise<{ lemma: string; forms: StripRow[] } | null> {
  const fallback = DEMO_STEMS[0];
  if (!fallback) return null;

  let stems = fallback;
  try {
    const lexemes = await prisma.lexeme.findMany({
      where: { lemma: fallback.lemma },
      include: { forms: true },
    });
    const [lex] = oneEntryPerLemma(lexemes, [fallback.lemma]);
    if (lex) stems = { ...stems, ...stemsFrom(lex.forms) };
  } catch {
    // A reference page renders whether or not the database is having a good
    // minute, which is the rule the landing page's own case explorer follows.
  }

  const forms = buildCaseTable(stems).flatMap((row) => {
    if (row.spec.principal || !row.spec.suffix) return [];
    const note = caseReference(row.spec.key);
    // shownForms rather than `singular`, because the illative has two right
    // answers and a strip that prints one has chosen which to be wrong about.
    // Only the one that ends in this case's own suffix can show the ending,
    // and where none does the row is left out rather than mislabelled.
    const value = shownForms(row).find((f) => f.endsWith(row.spec.suffix));
    if (!note || !value) return [];
    return [{
      stem: value.slice(0, value.length - row.spec.suffix.length),
      suffix: row.spec.suffix,
      // The first sense only. `plain` reads "onto, and to a person" because a
      // card has room to say both, and eleven of those side by side is a
      // paragraph laid out as chips. The strip is the shape of the system;
      // the card under it is where the second half of a meaning belongs.
      plain: note.plain.split(",")[0]!,
    }];
  });

  return forms.length > 0 ? { lemma: stems.lemma, forms } : null;
}
