import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { notFound } from "next/navigation";
import {
  ArrowLeft, ArrowRight, BookOpen, MessageCircleQuestion, PenLine, Target, TriangleAlert,
} from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { CASES } from "@/lib/estonian/cases";
import { allCaseReferences, caseReference } from "@/lib/estonian/grammar";
import { caseExamples, type CaseExample } from "@/lib/progress/caseExamples";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Empty, Note, Page, SectionTitle, Stack } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { SuggestFix } from "@/components/SuggestFix";
import { AI_TAG, NO_VALUE } from "@/lib/copy/values";

export const dynamic = "force-dynamic";

/** Pre-renders nothing, but tells Next the shape of the segment. */
export function generateStaticParams() {
  return CASES.map((c) => ({ caseKey: c.key.toLowerCase() }));
}

/** The ending, or the word "memorised" where there is no ending to give. */
function endingOf(ref: { spec: { principal: boolean; suffix: string } }): string {
  return ref.spec.principal ? "memorised" : `-${ref.spec.suffix}`;
}

/** The plain meaning as a heading. Everything else about it stays as written. */
function asTitle(plain: string): string {
  return plain.charAt(0).toUpperCase() + plain.slice(1);
}

export async function generateMetadata({ params }: { params: Promise<{ caseKey: string }> }) {
  const { caseKey } = await params;
  const ref = caseReference(caseKey.toUpperCase());
  if (!ref) return { title: "Grammar" };
  return {
    title: `${endingOf(ref)} means ${ref.plain} · ${ref.spec.et}`,
    description: ref.summary,
  };
}

const ORIGIN_LABEL: Record<CaseExample["origin"], { label: string; title: string }> = {
  EKILEX: {
    label: "Ekilex",
    title: "The form as the Institute of the Estonian Language records it",
  },
  STORED: {
    // "memorised" rather than "principal part", because on the sisseütlev page
    // every stored form is the short illative and `tuppa` is not one of the
    // three. The title under it was already saying the true thing.
    label: "memorised",
    title: "A memorised form held in the dictionary, not worked out from a stem",
  },
  DERIVED: {
    label: "from the genitive",
    title: "The regular ending on the stored genitive stem, the same arithmetic you are learning to do",
  },
};

/** How many attested sentences to print. Three is a sample; six is a wall. */
const SENTENCES = 3;

/**
 * One ending, explained.
 *
 * WHAT THE PAGE LEADS WITH IS WHAT THE ENDING MEANS. It used to lead with the
 * Estonian name and carry the Latin one beside it, which is right on a card
 * offering a choice between fourteen and wrong on the page somebody opens
 * because they cannot remember whether it is -s or -st. So the heading is the
 * English word, the eyebrow is the ending, and both names are in the card
 * underneath: a class says one and an English reference grammar says the
 * other, and neither is what a learner came here for.
 *
 * The prose is `lib/estonian/grammar.ts` and contains no Estonian. Every
 * Estonian word below it is read out of the dictionary by
 * `lib/progress/caseExamples.ts` and carries where it came from, because
 * "Ekilex says so" and "this app added an ending to a stem" are different
 * claims and a learner deserves to know which one they are looking at.
 */
export default async function CasePage({ params }: { params: Promise<{ caseKey: string }> }) {
  const { caseKey } = await params;
  const ref = caseReference(caseKey.toUpperCase());
  if (!ref) notFound();

  const ownerId = await requireUserId();
  const examples = await caseExamples(ownerId, ref.key, 6);

  const all = allCaseReferences();
  const index = all.findIndex((c) => c.key === ref.key);
  const previous = index > 0 ? all[index - 1] : undefined;
  const next = index < all.length - 1 ? all[index + 1] : undefined;

  const withSentence = examples.filter((e) => e.sentence).slice(0, SENTENCES);

  return (
    <Page
      eyebrow={
        // As written. `label-xs` uppercases, and an ending is a piece of
        // Estonian rather than a label: "-SSE" is not the ending. This is the
        // same rule `Chip`'s `caseSensitive` exists for.
        <span lang="et" style={{ textTransform: "none" }}>{endingOf(ref)}</span>
      }
      title={asTitle(ref.plain)}
      lead={ref.summary}
      actions={
        <Link
          href="/grammar"
          className="press inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-ui hover:-translate-y-px"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-2)" }}
        >
          <ArrowLeft size={14} aria-hidden /> All endings
        </Link>
      }
    >
      <Stack>
        <Card tone="accent">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="label-xs" style={{ color: "var(--accent-deep)" }}>The ending</dt>
              <dd className="mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                {ref.spec.principal ? (
                  <span className="text-base font-semibold" style={{ color: "var(--ink-2)" }}>
                    none, this one is memorised
                  </span>
                ) : (
                  <>
                    <span lang="et" className="text-2xl">-{ref.spec.suffix}</span>{" "}
                    <span className="text-xs font-normal" style={{ color: "var(--ink-3)" }}>
                      on the genitive
                    </span>
                  </>
                )}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="label-xs" style={{ color: "var(--accent-deep)" }}>Called</dt>
              <dd lang="et" className="mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                {ref.spec.et}
              </dd>
              <dd className="text-xs" style={{ color: "var(--ink-3)" }}>
                the {ref.spec.en.toLowerCase()}, in an English grammar
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="label-xs" style={{ color: "var(--accent-deep)" }}>Answers</dt>
              <dd lang="et" className="mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                {ref.spec.question}
              </dd>
            </div>
          </dl>
          {ref.englishHook && (
            <p className="mt-4 text-sm" style={{ color: "var(--ink-2)" }}>
              <span className="label-xs mr-2" style={{ color: "var(--accent-deep)" }}>In English</span>
              {ref.englishHook}
            </p>
          )}
        </Card>

        <section>
          <SectionTitle>Where it turns up</SectionTitle>
          <Card>
            <ul className="flex flex-col gap-2.5">
              {ref.uses.map((use) => (
                <li key={use} className="flex items-start gap-2.5 text-base" style={{ color: "var(--ink-2)" }}>
                  <span
                    aria-hidden
                    className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: "var(--accent)" }}
                  />
                  {use}
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section>
          <SectionTitle>Watch out</SectionTitle>
          <Card tone="butter">
            <div className="flex items-start gap-3">
              <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--butter-ink)" }} />
              <p className="text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
                {ref.watchOut}
              </p>
            </div>
          </Card>
        </section>

        <section>
          <SectionTitle hint={examples.some((e) => e.inDeck) ? "words from your deck first" : "from the dictionary"}>
            On real words
          </SectionTitle>
          {examples.length === 0 ? (
            <Empty
              title="No words to show it on yet"
              body="Every example here is read from the dictionary. Look a noun up and this fills in."
              action={<ButtonLink href="/dictionary" variant="primary">Open the dictionary</ButtonLink>}
            />
          ) : (
            <div
              className="overflow-x-auto rounded-[var(--r-lg)] border"
              style={{ borderColor: "var(--rule)", background: "var(--surface)", boxShadow: "var(--shadow-sm)" }}
            >
              <table className="w-full min-w-[460px] text-sm">
                <thead>
                  <tr>
                    {["Word", "Genitive", endingOf(ref), "From"].map((h, i) => (
                      <th
                        key={h}
                        className="label-xs px-3 py-2.5 text-left"
                        style={{
                          background: "var(--raised)",
                          color: "var(--ink-3)",
                          // The third heading is the ending itself, and an
                          // ending is not a label to be uppercased.
                          textTransform: i === 2 ? "none" : undefined,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {examples.map((example) => (
                    <tr key={example.lexemeId} style={{ borderTop: "1px solid var(--rule-soft)" }}>
                      <td className="px-3 py-2.5">
                        <Link
                          href={`/dictionary?q=${encodeURIComponent(example.lemma)}`}
                          className="hover:underline"
                        >
                          <span lang="et" className="text-base" style={{ color: "var(--ink)" }}>
                            {example.lemma}
                          </span>
                        </Link>
                        <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                          {example.translation}
                        </span>
                      </td>
                      <td lang="et" className="px-3 py-2.5" style={{ color: "var(--ink-3)" }}>
                        {example.genitive ?? NO_VALUE}
                      </td>
                      <td className="px-3 py-2.5">
                        {/* Both illatives where the word has both: one answer
                            to one question, and a table that prints either
                            alone has chosen which word to be wrong about. The
                            second is set in the quieter ink because it is the
                            regular ending rather than the form the dictionary
                            recorded, which is the same distinction the chip
                            beside it makes. */}
                        <span className="inline-flex items-center gap-1.5">
                          <span lang="et" className="text-base font-semibold" style={{ color: "var(--accent-deep)" }}>
                            {example.form}
                          </span>
                          {example.alsoRight && (
                            <span lang="et" className="text-base" style={{ color: "var(--ink-3)" }}>
                              / {example.alsoRight}
                            </span>
                          )}
                          <Speak text={example.form} label={`Hear "${example.form}"`} size={13} />
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <Chip
                          tone={example.origin === "DERIVED" ? "neutral" : "sky"}
                          title={ORIGIN_LABEL[example.origin].title}
                        >
                          {ORIGIN_LABEL[example.origin].label}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {withSentence.length > 0 && (
          <section>
            <SectionTitle hint="attested, from Ekilex">In a sentence</SectionTitle>
            <ul className="flex flex-col gap-2">
              {withSentence.map((example) => (
                <li key={`${example.lexemeId}-sentence`}>
                  <Card>
                    <div className="flex items-start gap-2">
                      <p lang="et" className="min-w-0 flex-1 text-base leading-snug" style={{ color: "var(--ink)" }}>
                        {example.sentence!.et}
                      </p>
                      <Speak text={example.sentence!.et} label="Hear the sentence" />
                    </div>
                    {example.sentence!.en && (
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
                        {example.sentence!.en}
                        <Chip tone="again" title="Machine translation. Trust the Estonian above, not this.">
                          {AI_TAG}
                        </Chip>
                      </p>
                    )}
                    <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                      contains{" "}
                      <span lang="et" style={{ color: "var(--accent-deep)" }}>{example.sentenceForm ?? example.form}</span>
                      {", "}the <span lang="et">{ref.spec.et}</span> of{" "}
                      <span lang="et">{example.lemma}</span>
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/review?case=${ref.key}`} variant="primary">
            <Target size={15} aria-hidden /> Drill it
          </ButtonLink>
          {/* Writing a sentence in a case is the hardest thing you can do with
              one, so it belongs on the page that just explained it rather than
              on a menu that cannot say which case you are stuck on. */}
          <ButtonLink href="/review/write">
            <PenLine size={15} aria-hidden /> Write a sentence with it
          </ButtonLink>
          <ButtonLink href="/dictionary">
            <BookOpen size={15} aria-hidden /> Look a word up
          </ButtonLink>
          <ButtonLink href="/tutor">
            <MessageCircleQuestion size={15} aria-hidden /> Ask Anu about it
          </ButtonLink>
        </div>

        <Note tone="neutral">
          A drill only opens for words in your deck that carry this ending. If nothing comes up, add
          a noun unit from the course.
        </Note>

        {/*
          The reference is prose we wrote about a language we do not speak
          natively, next to forms the dictionary supplied. Both can be wrong,
          and the reader is frequently in a class with somebody who will tell
          them so that afternoon.
        */}
        <div className="flex flex-wrap items-center gap-3 border-t pt-5" style={{ borderColor: "var(--rule-soft)" }}>
          <p className="text-sm" style={{ color: "var(--ink-3)" }}>
            Does this not match what your course says?
          </p>
          <SuggestFix
            category="WRONG_CONTENT"
            trigger={`The grammar reference for ${ref.spec.et} (${ref.spec.en})`}
            label="Tell us what is wrong"
          />
        </div>

        <nav
          aria-label="Endings"
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"
          style={{ borderColor: "var(--rule-soft)" }}
        >
          {previous ? (
            <Link
              href={`/grammar/${previous.key.toLowerCase()}`}
              className="flex items-center gap-1.5 text-sm"
              style={{ color: "var(--ink-2)" }}
            >
              <ArrowLeft size={14} aria-hidden /> {endingOf(previous)}
              <span style={{ color: "var(--ink-3)" }}>{previous.plain}</span>
            </Link>
          ) : <span />}
          {next && (
            <Link
              href={`/grammar/${next.key.toLowerCase()}`}
              className="flex items-center gap-1.5 text-sm"
              style={{ color: "var(--ink-2)" }}
            >
              {endingOf(next)} <span style={{ color: "var(--ink-3)" }}>{next.plain}</span>
              <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </nav>
      </Stack>
    </Page>
  );
}
