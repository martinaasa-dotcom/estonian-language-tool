import Link from "next/link";
import { ArrowRight, Sparkles, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { CASE_GROUPS, caseReference } from "@/lib/estonian/grammar";
import { caseAccuracy } from "@/lib/stats/history";
import { Card, Chip, Meter, Note, Page, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Grammar — the fourteen cases",
  description: "What each Estonian case is for, in English, with real forms from the dictionary.",
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
    where: { targetCase: { not: null }, card: { ownerId } },
    select: { targetCase: true, rating: true },
    take: 5000,
  });
  const weakest = caseAccuracy(caseReviews).slice(0, 3);

  return (
    <Page
      eyebrow="Reference"
      title="The fourteen cases"
      lead="What each one is for, when Estonian reaches for it, and the mistake an English speaker actually makes. Every Estonian word on these pages comes from the dictionary — the explanations are the only part this app wrote."
    >
      <div className="flex flex-col gap-7">
        <Card tone="accent">
          <div className="flex items-start gap-3">
            <Sparkles size={20} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent-deep)" }} />
            <div>
              <p className="est text-[19px] font-bold" style={{ color: "var(--ink)" }}>
                Learn one form, get eleven cases
              </p>
              <p className="mt-2 max-w-[62ch] text-[14.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                Three of the fourteen are unpredictable and have to be memorised word by word. The
                other eleven are regular endings on the second of those three — the genitive. That
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
                        className="flex flex-wrap items-center gap-3 rounded-[var(--r)] px-2 py-1.5 transition-opacity hover:opacity-75"
                      >
                        <Target size={15} aria-hidden style={{ color: "var(--ink-3)" }} />
                        <span className="w-28 text-[14px]" style={{ color: "var(--ink)" }}>{ref.spec.en}</span>
                        <span className="max-w-[200px] flex-1">
                          <Meter
                            pct={c.accuracy}
                            label={`${ref.spec.en} accuracy`}
                            tone={c.accuracy >= 85 ? "var(--good)" : c.accuracy >= 65 ? "var(--hard)" : "var(--again)"}
                            height={5}
                          />
                        </span>
                        <span className="tnum text-[12.5px]" style={{ color: "var(--ink-3)" }}>
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
            <p className="mb-3 max-w-[68ch] text-[13.5px]" style={{ color: "var(--ink-2)" }}>
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
                        <span className="est text-[18px] font-bold" style={{ color: "var(--ink)" }}>
                          {ref.spec.en}
                        </span>
                        <span lang="et" className="text-[12.5px] italic" style={{ color: "var(--ink-3)" }}>
                          {ref.spec.et}
                        </span>
                        <span className="ml-auto">
                          {ref.spec.principal
                            ? <Chip tone="hard">memorised</Chip>
                            : <Chip tone="accent" caseSensitive>{`-${ref.spec.suffix}`}</Chip>}
                        </span>
                      </span>
                      <span className="text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                        {ref.summary}
                      </span>
                      <span lang="et" className="text-[12px]" style={{ color: "var(--ink-3)" }}>
                        {ref.spec.question}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        <Note tone="neutral">
          The endings above attach to the genitive singular, and to the genitive plural for the
          plural column. Estonian does not derive the plural stem from the singular one, so where
          the app has not been given a genitive plural it shows a gap rather than a guess.
        </Note>

        <p className="text-[13px]" style={{ color: "var(--ink-3)" }}>
          Still stuck on one?{" "}
          <Link href="/tutor" className="underline" style={{ color: "var(--accent)" }}>
            Ask Anu
          </Link>{" "}
          — she can take a sentence you wrote and name the rule behind the correction.{" "}
          <ArrowRight size={12} aria-hidden className="inline" />
        </p>
      </div>
    </Page>
  );
}
