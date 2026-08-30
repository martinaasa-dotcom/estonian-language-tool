import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, MessageCircleQuestion, Target, TriangleAlert } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { CASES } from "@/lib/estonian/cases";
import { allCaseReferences, caseReference } from "@/lib/estonian/grammar";
import { caseExamples, type CaseExample } from "@/lib/progress/caseExamples";
import { ButtonLink } from "@/components/Button";
import { Card, Chip, Empty, Note, Page, SectionTitle, Stack } from "@/components/ui";
import { Speak } from "@/components/Speak";
import { SuggestFix } from "@/components/SuggestFix";
import { NO_VALUE } from "@/lib/copy/values";

export const dynamic = "force-dynamic";

/** Pre-renders nothing, but tells Next the shape of the segment. */
export function generateStaticParams() {
  return CASES.map((c) => ({ caseKey: c.key.toLowerCase() }));
}

export async function generateMetadata({ params }: { params: Promise<{ caseKey: string }> }) {
  const { caseKey } = await params;
  const ref = caseReference(caseKey.toUpperCase());
  if (!ref) return { title: "Grammar" };
  return {
    title: `${ref.spec.et} · ${ref.spec.question} · Estonian grammar`,
    description: ref.summary,
  };
}

const ORIGIN_LABEL: Record<CaseExample["origin"], { label: string; title: string }> = {
  EKILEX: {
    label: "Ekilex",
    title: "The form as the Institute of the Estonian Language records it",
  },
  STORED: {
    label: "principal part",
    title: "A memorised form held in the dictionary, not worked out from a stem",
  },
  DERIVED: {
    label: "from the genitive",
    title: "The regular ending on the stored genitive stem, the same arithmetic you are learning to do",
  },
};

/**
 * One case, explained.
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

  const withSentence = examples.filter((e) => e.sentence);

  return (
    <Page
      eyebrow={`Case ${index + 1} of ${all.length}`}
      title={ref.spec.et}
      titleLang="et"
      lead={ref.summary}
      actions={
        <Link
          href="/grammar"
          className="press inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-semibold transition-ui hover:-translate-y-px"
          style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-2)" }}
        >
          <ArrowLeft size={14} aria-hidden /> All cases
        </Link>
      }
    >
      <Stack>
        <Card tone="accent">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="label-xs" style={{ color: "var(--accent-deep)", opacity: 0.8 }}>Answers</dt>
              <dd lang="et" className="est mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                {ref.spec.question}
              </dd>
            </div>
            <div>
              <dt className="label-xs" style={{ color: "var(--accent-deep)", opacity: 0.8 }}>
                In English references
              </dt>
              <dd className="est mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                the {ref.spec.en.toLowerCase()}
              </dd>
            </div>
            <div>
              <dt className="label-xs" style={{ color: "var(--accent-deep)", opacity: 0.8 }}>Ending</dt>
              <dd className="est mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                {ref.spec.principal
                  ? <span className="text-base font-semibold" style={{ color: "var(--ink-2)" }}>memorised, not derived</span>
                  : <>-{ref.spec.suffix} <span className="text-xs font-normal" style={{ color: "var(--ink-3)" }}>on the genitive</span></>}
              </dd>
            </div>
          </dl>
          {ref.englishHook && (
            <p className="mt-4 text-sm" style={{ color: "var(--ink-2)" }}>
              <span className="label-xs mr-2" style={{ color: "var(--accent-deep)", opacity: 0.8 }}>In English</span>
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
            In real words
          </SectionTitle>
          {examples.length === 0 ? (
            <Empty
              title="No words to show it on yet"
              body="This page builds its examples out of the dictionary. Look a noun up and it will have something to show, nothing here is written by the app."
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
                    {["Word", "Genitive", ref.spec.et, "From"].map((h) => (
                      <th
                        key={h}
                        className="label-xs px-3 py-2.5 text-left"
                        style={{ background: "var(--raised)", color: "var(--ink-3)" }}
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
                          <span lang="et" className="est text-base" style={{ color: "var(--ink)" }}>
                            {example.lemma}
                          </span>
                        </Link>
                        <span className="block text-xs" style={{ color: "var(--ink-3)" }}>
                          {example.translation}
                        </span>
                      </td>
                      <td lang="et" className="est px-3 py-2.5" style={{ color: "var(--ink-3)" }}>
                        {example.genitive ?? NO_VALUE}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span lang="et" className="est text-base font-semibold" style={{ color: "var(--accent-deep)" }}>
                            {example.form}
                          </span>
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
                      <p lang="et" className="est flex-1 text-base leading-snug" style={{ color: "var(--ink)" }}>
                        {example.sentence!.et}
                      </p>
                      <Speak text={example.sentence!.et} label="Hear the sentence" />
                    </div>
                    {example.sentence!.en && (
                      <p className="mt-1 flex items-center gap-2 text-sm" style={{ color: "var(--ink-2)" }}>
                        {example.sentence!.en}
                        <Chip tone="again" title="Machine translation, the Estonian above is authoritative, this is not">
                          AI
                        </Chip>
                      </p>
                    )}
                    <p className="mt-2 text-xs" style={{ color: "var(--ink-3)" }}>
                      contains{" "}
                      <span lang="et" className="est" style={{ color: "var(--accent-deep)" }}>{example.form}</span>
                      {", "}the <span lang="et">{ref.spec.et}</span> of{" "}
                      <span lang="et" className="est">{example.lemma}</span>
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/review?case=${ref.key}`} variant="primary">
            <Target size={15} aria-hidden /> Drill this case
          </ButtonLink>
          <ButtonLink href="/dictionary">
            <BookOpen size={15} aria-hidden /> Look a word up
          </ButtonLink>
          <ButtonLink href="/tutor">
            <MessageCircleQuestion size={15} aria-hidden /> Ask Anu about it
          </ButtonLink>
        </div>

        <Note tone="neutral">
          A drill only opens for words in your deck that carry this case. If nothing comes up, add a
          noun unit from the path, the case cards are generated from the forms the dictionary
          holds, never from a pattern applied blindly.
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
          aria-label="Cases"
          className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"
          style={{ borderColor: "var(--rule-soft)" }}
        >
          {previous ? (
            <Link
              href={`/grammar/${previous.key.toLowerCase()}`}
              className="flex items-center gap-1.5 text-sm"
              style={{ color: "var(--ink-2)" }}
            >
              <ArrowLeft size={14} aria-hidden /> <span lang="et">{previous.spec.et}</span>
            </Link>
          ) : <span />}
          {next && (
            <Link
              href={`/grammar/${next.key.toLowerCase()}`}
              className="flex items-center gap-1.5 text-sm"
              style={{ color: "var(--ink-2)" }}
            >
              <span lang="et">{next.spec.et}</span> <ArrowRight size={14} aria-hidden />
            </Link>
          )}
        </nav>
      </Stack>
    </Page>
  );
}
