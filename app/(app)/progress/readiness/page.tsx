import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowLeft } from "lucide-react";
import { requireUserId } from "@/lib/auth/session";
import { LEVELS, LEVEL_INFO, type Level } from "@/lib/collections/syllabus";
import { readinessPicture } from "@/lib/progress/readiness";
import { ButtonLink } from "@/components/Button";
import { Card, Empty, Page, SectionTitle, Stack } from "@/components/ui";
import { ReadinessSummary } from "@/components/readiness/Summary";
import { SituationRow } from "@/components/readiness/SituationRow";
import { RUNG_LABEL } from "@/lib/readiness/rungs";

export const metadata = { title: "In real life" };

export const dynamic = "force-dynamic";

/**
 * Every situation the course promises, and where the learner stands on each.
 *
 * "You would understand 81 percent of everyday situations" is the number an
 * app can compute from a word count, and it is the wrong question: knowing
 * the words for a health center is what lets you follow the receptionist,
 * not what lets you answer her. So this page reads each of the course's own
 * claims on three rungs, follow, take part, lead, and says which one the
 * review log actually supports, what the evidence is worth, and what stands
 * in the way. The headline is a distribution and never a percentage.
 *
 * The learner's own level leads and the others follow in course order,
 * because the situations at your level are the ones you meet this week.
 */
export default async function ReadinessPage() {
  const ownerId = await requireUserId();
  const picture = await readinessPicture(ownerId);

  if (picture.totalReviews === 0) {
    return (
      <Page
        eyebrow="Readiness"
        title="In real life"
        lead="Which situations you could follow, take part in or lead, read off your own answers."
      >
        <Empty
          title="Nothing answered yet"
          body="This reads your reviews, and there are none. It has an opinion after your first session."
          action={<ButtonLink href="/learn" variant="primary">Open the learning path</ButtonLink>}
        />
      </Page>
    );
  }

  const ordered: Level[] = [picture.level, ...LEVELS.filter((l) => l !== picture.level)];
  const worthTrying = picture.summary.couldTry.slice(0, 3);

  return (
    <Page
      eyebrow="Readiness"
      title="In real life"
      lead="Which situations you could follow, take part in or lead, read off your own answers."
      actions={
        <Link href="/progress" className="flex items-center gap-1.5 text-sm" style={{ color: "var(--accent-deep)" }}>
          <ArrowLeft size={14} aria-hidden /> Back to progress
        </Link>
      }
    >
      <Stack>
        <section>
          <SectionTitle hint={`at ${picture.level} · your level, from Settings`}>Where you stand</SectionTitle>
          <Card>
            <ReadinessSummary summary={picture.summary} />
            <p className="mt-4 text-sm" style={{ color: "var(--ink-2)" }}>
              Three rungs, and the first is the one a word count measures. {RUNG_LABEL.follow} means you would
              understand most of it. {RUNG_LABEL.takePart} means you could answer, with the words and the endings
              it needs, without a long silence first. {RUNG_LABEL.lead} means you could open it, steer it and recover
              when it goes sideways, which for a live exchange also needs some evidence you can follow speech.
              Recognizing words on cards never clears the second rung on its own.
            </p>
          </Card>
        </section>

        {worthTrying.length > 0 && (
          <section>
            <SectionTitle hint="the log says you have enough for these">Worth trying this week</SectionTitle>
            <div className="grid gap-3 md:grid-cols-3">
              {worthTrying.map((r) => (
                <Card key={r.situation.id} tone="mint">
                  <p className="label-xs" style={{ color: "var(--mint-ink)" }}>{RUNG_LABEL[r.rung]}</p>
                  <p className="mt-1.5 font-semibold" style={{ color: "var(--mint-ink)" }}>{r.tryThis}</p>
                  <Link
                    href={`/progress/readiness/${r.situation.id}`}
                    className="mt-2 inline-block text-sm underline underline-offset-2"
                    style={{ color: "var(--mint-ink)" }}
                  >
                    {r.situation.claim}
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        )}

        {ordered.map((level) => {
          const rows = picture.readings.filter((r) => r.situation.level === level);
          if (rows.length === 0) return null;
          return (
            <section key={level}>
              <SectionTitle hint={LEVEL_INFO[level].arrival}>
                {level} · <span lang="et">{LEVEL_INFO[level].title}</span>
              </SectionTitle>
              <ul className="flex flex-col gap-3">
                {rows.map((r) => (
                  <li key={r.situation.id}><SituationRow reading={r} /></li>
                ))}
              </ul>
            </section>
          );
        })}

        <p className="text-xs" style={{ color: "var(--ink-3)" }}>
          Nothing here has heard you speak, and no number on this page pretends to. How you sound is yours to judge, in{" "}
          <Link href="/review/speaking" className="underline" style={{ color: "var(--accent-deep)" }}>speaking practice</Link>.
        </p>
      </Stack>
    </Page>
  );
}
