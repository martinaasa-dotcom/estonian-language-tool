import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { oneEntryPerLemma } from "@/lib/dict/search";
import { readingFor, readinessPicture } from "@/lib/progress/readiness";
import { situationById } from "@/lib/readiness/situations";
import { Page } from "@/components/ui";
import { ButtonLink } from "@/components/Button";
import { SituationDetail } from "@/components/readiness/SituationDetail";

export async function generateMetadata({ params }: { params: Promise<{ situationId: string }> }) {
  const { situationId } = await params;
  const situation = situationById(situationId);
  return { title: situation ? situation.title : "Situation" };
}

export const dynamic = "force-dynamic";

/**
 * One situation, in full. The claim is the heading, because it is the thing
 * being answered; the unit's Estonian title is the eyebrow, which is the
 * cross-reference to the course.
 */
export default async function SituationPage({ params }: { params: Promise<{ situationId: string }> }) {
  const { situationId } = await params;
  const situation = situationById(situationId);
  if (!situation) notFound();

  const ownerId = await requireUserId();
  const [reading, picture, rows] = await Promise.all([
    readingFor(ownerId, situationId),
    readinessPicture(ownerId),
    prisma.lexeme.findMany({
      where: { lemma: { in: [...situation.lemmas] } },
      select: { id: true, lemma: true, translation: true, pos: true, provenance: true, forms: { select: { formType: true } } },
    }),
  ]);
  if (!reading) notFound();

  // One row per lemma, in the unit's own order, for the reason the unit page
  // gives: a lemma can hold two entries and a list would print both. The
  // evidence comes off the same picture the list page read, so the two agree.
  const words = oneEntryPerLemma(rows, situation.lemmas).map((l) => ({
    lemma: l.lemma,
    gloss: l.translation,
    evidence: picture.evidence.get(l.lemma),
  }));

  return (
    <Page
      eyebrow={<><span lang="et">{situation.title}</span> · {situation.level}</>}
      title={situation.claim}
      lead="Read off your own answers, and honest about what it cannot see."
      actions={
        <span className="flex flex-wrap gap-2">
          <Link href="/progress/readiness" className="flex items-center gap-1.5 text-sm" style={{ color: "var(--accent-deep)" }}>
            <ArrowLeft size={14} aria-hidden /> All situations
          </Link>
          <ButtonLink href={`/learn/${situation.id}`} size="sm">Open the unit</ButtonLink>
        </span>
      }
    >
      <SituationDetail reading={reading} words={words} />
    </Page>
  );
}
