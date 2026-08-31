import Link from "next/link";
import { ArrowRight, Sparkles, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { CASE_GROUPS, TOPIC_GROUPS, TOPIC_NOTES, caseReference, grammarTopic } from "@/lib/estonian/grammar";
import { VERB_AXES, grammarGroupTerm, grammarTerm } from "@/lib/estonian/terms";
import { caseAccuracy } from "@/lib/stats/history";
import { Card, Chip, Meter, Note, Page, SectionTitle, Stack } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Grammar · käänded, kõneviisid ja laused",
  description:
    "Every case and every verb form under the name a course gives it and the question it answers, explained in English, with real forms from the dictionary.",
};

/**
 * The reference layer.
 *
 * Every other screen in the app tests. This one explains — which is the half a
 * flashcard app usually leaves to a textbook the learner does not own. It is
 * English prose about Estonian (`lib/estonian/grammar.ts`) paired with forms
 * read out of the dictionary, so nothing on it is invented and nothing on it is
 * an exercise.
 *
 * The weak-case list at the bottom is what turns it from a reference into a
 * next step: the case you keep missing, with the page that explains it.
 */
export default async function GrammarIndexPage() {
  const ownerId = await requireUserId();

  const caseReviews = await prisma.review.findMany({
    where: { targetCase: { not: null }, ownerId },
    select: { targetCase: true, rating: true },
    take: 5000,
  });
  const weakest = caseAccuracy(caseReviews).slice(0, 3);

  return (
    <Page
      eyebrow="Reference"
      title="Grammar"
      lead="Named the way a course names them: the Estonian term and the question it answers."
    >
      <Stack>
        <Card tone="accent">
          <div className="flex items-start gap-3">
            <Sparkles size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent-deep)" }} />
            <div>
              <p className="est text-lg font-bold" style={{ color: "var(--ink)" }}>
                Learn one form, get eleven cases
              </p>
              <p className="mt-2 max-w-[62ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Three of the fourteen are unpredictable and have to be memorised word by word. The
                other eleven are regular endings on the second of those three, the genitive. That
                is why the app drills the genitive so hard, and why a case table is mostly
                arithmetic once you have it.
              </p>
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
                        className="tap-tint flex flex-wrap items-center gap-3 rounded-[var(--r)] px-2 py-1.5"
                      >
                        <Target size={15} aria-hidden style={{ color: "var(--ink-3)" }} />
                        <span className="w-28 text-sm">
                          <span lang="et" className="block" style={{ color: "var(--ink)" }}>{ref.spec.et}</span>
                          <span lang="et" className="block text-xs" style={{ color: "var(--ink-3)" }}>
                            {ref.spec.question}
                          </span>
                        </span>
                        <span className="max-w-[200px] flex-1">
                          <Meter
                            pct={c.accuracy}
                            label={`${ref.spec.et} accuracy`}
                            tone={c.accuracy >= 85 ? "var(--good)" : c.accuracy >= 65 ? "var(--hard)" : "var(--again)"}
                            height={5}
                          />
                        </span>
                        <span className="tnum text-xs" style={{ color: "var(--ink-3)" }}>
                          {c.accuracy}% over {c.total}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>
        )}

        {CASE_GROUPS.map((group) => (
          <section key={group.title}>
            <SectionTitle>{group.title}</SectionTitle>
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
                      <span className="flex flex-wrap items-baseline gap-2">
                        <span lang="et" className="est text-md font-bold" style={{ color: "var(--ink)" }}>
                          {ref.spec.et}
                        </span>
                        <span lang="et" className="est text-sm font-semibold" style={{ color: "var(--accent-deep)" }}>
                          {ref.spec.question}
                        </span>
                        <span className="ml-auto">
                          {ref.spec.principal
                            ? <Chip tone="hard">memorised</Chip>
                            : <Chip tone="accent" caseSensitive>{`-${ref.spec.suffix}`}</Chip>}
                        </span>
                      </span>
                      <span className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                        {ref.summary}
                      </span>
                      <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                        In English references: the {ref.spec.en.toLowerCase()}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <Card tone="butter">
          <p className="est text-lg font-bold" style={{ color: "var(--ink)" }}>
            Estonian does not have six tenses
          </p>
          <p className="mt-2 max-w-[68ch] text-base leading-relaxed" style={{ color: "var(--ink-2)" }}>
            The verb carries two tenses; the other two are the auxiliary plus a participle. Mood,
            voice and person are separate axes crossing all of them, and a course names a form by
            saying where it sits on each. That is four short systems, not one long row of tenses
            borrowed from English, and it is why the endings stop looking arbitrary once you know
            which axis you are on.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            {VERB_AXES.map((axis) => (
              <div key={axis.et} className="rounded-[var(--r-md)] p-3" style={{ background: "var(--surface)" }}>
                <dt className="flex flex-wrap items-baseline gap-2">
                  <span lang="et" className="est text-md font-bold" style={{ color: "var(--ink)" }}>
                    {axis.et}
                  </span>
                  <span className="text-xs" style={{ color: "var(--ink-3)" }}>{axis.en}</span>
                </dt>
                <dd className="mt-1 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {axis.blurb}
                </dd>
              </div>
            ))}
          </dl>
        </Card>

        <section>
          <SectionTitle hint={`${TOPIC_NOTES.length} points`}>Beyond the cases</SectionTitle>
          <p className="mt-1 max-w-[68ch] text-sm" style={{ color: "var(--ink-2)" }}>
            Grouped by what kind of word is doing the work, which is how a course orders them.
            Each point is named as a course names it and explained in English underneath, and
            links to the units that drill it.
          </p>
          <div className="mt-4 flex flex-col gap-6">
            {TOPIC_GROUPS.map((group) => {
              const groupTerm = grammarGroupTerm(group.id);
              return (
                <div key={group.id}>
                  <h3 className="flex flex-wrap items-baseline gap-2">
                    {groupTerm && (
                      <span lang="et" className="est text-md font-bold" style={{ color: "var(--ink)" }}>
                        {groupTerm}
                      </span>
                    )}
                    <span className="text-sm" style={{ color: "var(--ink-2)" }}>{group.title}</span>
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
                            <span className="flex flex-wrap items-baseline gap-2">
                              <span
                                lang={term ? "et" : undefined}
                                className="est text-md font-bold"
                                style={{ color: "var(--ink)" }}
                              >
                                {term?.et ?? topic.title}
                              </span>
                              {term?.question && (
                                <span lang="et" className="est text-sm font-semibold" style={{ color: "var(--accent-deep)" }}>
                                  {term.question}
                                </span>
                              )}
                              {topic.marker && (
                                <span className="ml-auto">
                                  <Chip tone="accent" caseSensitive>{topic.marker}</Chip>
                                </span>
                              )}
                            </span>
                            {term && (
                              <span className="text-sm font-medium" style={{ color: "var(--ink-2)" }}>
                                {topic.title}
                              </span>
                            )}
                            <span className="text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
                              {topic.summary}
                            </span>
                            {term?.alsoCalled && (
                              <span className="text-xs" style={{ color: "var(--ink-3)" }}>
                                In English references: {term.alsoCalled}
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
          The endings above attach to the genitive singular, and to the genitive plural for the
          plural column. Estonian does not derive the plural stem from the singular one, so where
          the app has not been given a genitive plural it shows a gap rather than a guess.
        </Note>

        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          Still stuck on one?{" "}
          <Link href="/tutor" className="underline" style={{ color: "var(--accent-deep)" }}>
            Ask Anu
          </Link>{" "}
          and she can take a sentence you wrote and name the rule behind the correction.{" "}
          <ArrowRight size={12} aria-hidden className="inline" />
        </p>
      </Stack>
    </Page>
  );
}
