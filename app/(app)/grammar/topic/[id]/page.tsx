import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, TriangleAlert } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { TOPIC_NOTES, grammarTopic } from "@/lib/estonian/grammar";
import { grammarTerm } from "@/lib/estonian/terms";
import { SYLLABUS } from "@/lib/collections/syllabus";
import { Card, Chip, Note, Page, SectionTitle, Stack } from "@/components/ui";
import { DrillLink } from "@/components/DrillLink";

/**
 * The grammar topics with a drill of their own.
 *
 * Two, and both are things you cannot learn from a page about them. Rektsioon
 * has to be met verb by verb, because `aitan sind` and `helistan sulle` look
 * identical in English and only the drill tells them apart. Quantitative
 * gradation is a length distinction Estonian spelling only half records, so
 * `maja` against `majja` is a question about what you can hear rather than what
 * you can read. Both drills used to sit on the practice menu, which is the one
 * screen that cannot tell you either of them is what you are getting wrong.
 */
const TOPIC_DRILL: Record<string, string> = {
  government: "/review/government",
  gradation: "/review/pairs",
};

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return TOPIC_NOTES.map((t) => ({ id: t.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = grammarTopic(id);
  if (!topic) return { title: "Grammar" };
  const term = grammarTerm(id);
  return {
    title: `Grammar · ${term ? `${term.et}, ${topic.title.toLowerCase()}` : topic.title}`,
    description: topic.summary,
  };
}

/**
 * One grammar point that is not a case.
 *
 * Deliberately sparser than the case pages, and the difference is honest rather
 * than unfinished. A case page can show the case on real words, because every
 * form on it is read out of the dictionary with its provenance. There is no
 * equally safe way to illustrate the quotative: picking sentences whose words
 * end in the right letters would be the app asserting a grammatical analysis it
 * has not verified, which is the same failure as generating a form, wearing a
 * different hat.
 *
 * So this page explains in English and then hands over to the units that teach
 * the point, where the examples are attested and in context.
 */
export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = grammarTopic(id);
  if (!topic) notFound();

  await requireUserId();

  const term = grammarTerm(id);

  const units = SYLLABUS.filter((u) => u.grammar.includes(id));

  return (
    <Page
      eyebrow="Reference"
      title={term?.et ?? topic.title}
      titleLang={term ? "et" : undefined}
      lead={topic.summary}
      actions={
        <Link href="/grammar" className="flex items-center gap-1.5 text-sm" style={{ color: "var(--accent-deep)" }}>
          <ArrowLeft size={14} aria-hidden /> All grammar
        </Link>
      }
    >
      <Stack>
        {(term || topic.marker) && (
          <Card tone="accent">
            <dl className="grid gap-4 sm:grid-cols-3">
              {term?.question && (
                <div>
                  <dt className="label-xs" style={{ color: "var(--accent-deep)" }}>
                    Answers
                  </dt>
                  <dd lang="et" className="est mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                    {term.question}
                  </dd>
                </div>
              )}
              <div>
                <dt className="label-xs" style={{ color: "var(--accent-deep)" }}>
                  In plain English
                </dt>
                <dd className="est mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                  {topic.title}
                </dd>
              </div>
              {term?.alsoCalled && (
                <div>
                  <dt className="label-xs" style={{ color: "var(--accent-deep)" }}>
                    In English references
                  </dt>
                  <dd className="est mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                    {term.alsoCalled}
                  </dd>
                </div>
              )}
              {topic.marker && (
                <div>
                  <dt className="label-xs" style={{ color: "var(--accent-deep)" }}>
                    The ending that carries it
                  </dt>
                  <dd lang="et" className="est mt-1 text-lg font-bold" style={{ color: "var(--ink)" }}>
                    {topic.marker}
                  </dd>
                </div>
              )}
            </dl>
            <p className="mt-4 max-w-[68ch] text-sm" style={{ color: "var(--ink-2)" }}>
              {term
                ? "The heading is what a course, a textbook and the state examination call this. The English name is here so that an English reference grammar is still usable, not because anybody teaching Estonian says it. "
                : "There is no settled Estonian term a class would use for this one, so it keeps its English description rather than being given an invented name. "}
              {topic.marker
                ? "The ending above is named as terminology; the forms themselves live on the dictionary entries, where every one of them came from Ekilex rather than from this app."
                : "Every Estonian form the app shows comes from the dictionary, never from this page."}
            </p>
          </Card>
        )}

        <section>
          <SectionTitle>What it is for</SectionTitle>
          <ul className="mt-2 flex flex-col gap-2">
            {topic.points.map((point) => (
              <li
                key={point}
                className="rounded-[var(--r-md)] border p-3 text-base leading-relaxed"
                style={{ borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-2)" }}
              >
                {point}
              </li>
            ))}
          </ul>
        </section>

        <Note tone="hard">
          <span className="flex items-start gap-2">
            <TriangleAlert size={17} aria-hidden className="mt-0.5 shrink-0" />
            <span>{topic.watchOut}</span>
          </span>
        </Note>

        <section>
          <SectionTitle hint={`${units.length} unit${units.length === 1 ? "" : "s"}`}>
            Where the course teaches it
          </SectionTitle>
          {units.length === 0 ? (
            <p className="mt-2 text-sm" style={{ color: "var(--ink-3)" }}>
              No unit names this point yet. It is here as reference rather than as a lesson.
            </p>
          ) : (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {units.map((unit) => (
                <li
                  key={unit.id}
                  className="rounded-[var(--r-md)] border p-3"
                  style={{ borderColor: "var(--rule)", background: "var(--surface)" }}
                >
                  <span className="flex flex-wrap items-baseline gap-2">
                    <Link
                      href={`/learn/${unit.id}`}
                      lang="et"
                      className="est text-md font-bold hover:underline"
                      style={{ color: "var(--ink)" }}
                    >
                      {unit.title}
                    </Link>
                    <Chip tone="sky">{unit.level}</Chip>
                  </span>
                  <span className="mt-1 block text-sm" style={{ color: "var(--ink-2)" }}>
                    {unit.canDo}
                  </span>
                  <Link
                    href={`/learn/${unit.id}/lesson`}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm underline"
                    style={{ color: "var(--accent-deep)" }}
                  >
                    <BookOpen size={14} aria-hidden /> Take the lesson
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {TOPIC_DRILL[id] && (
          <section>
            <SectionTitle hint="from your own deck">Drill it</SectionTitle>
            <DrillLink href={TOPIC_DRILL[id]!} />
          </section>
        )}
      </Stack>
    </Page>
  );
}
