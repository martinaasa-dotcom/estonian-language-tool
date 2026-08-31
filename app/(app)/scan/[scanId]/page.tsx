import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Grid2x2, GraduationCap, Zap } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { deckSnapshot } from "@/lib/progress/summary";
import { unitProgress } from "@/lib/collections/syllabus";
import { MAX_ITEMS } from "@/lib/scan/extract";
import { parseItems, summarise } from "@/lib/scan/items";
import { Speak } from "@/components/Speak";
import { Card, Chip, Meter, Note, Page, Ring, SectionTitle } from "@/components/ui";
import { ScanActions } from "./ScanActions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const ownerId = await requireUserId();
  const scan = await prisma.scan.findFirst({
    where: { id: scanId, ownerId },
    select: { title: true },
  });
  return { title: scan ? scan.title : "A page" };
}

/**
 * One photographed page, as something to study.
 *
 * The same shape as a learning-path unit, deliberately: how much of it you
 * know, the words themselves with audio and their real principal parts, and
 * the two things worth doing next. It is not a new game. Every mode in this app
 * grades through the same review log (ADR-016), so a page is drilled by the
 * review session with the page as its filter rather than by a private quiz
 * that would keep a score nobody else could see.
 */
export default async function ScanSetPage({ params }: { params: Promise<{ scanId: string }> }) {
  const { scanId } = await params;
  const ownerId = await requireUserId();

  const scan = await prisma.scan.findFirst({
    where: { id: scanId, ownerId },
    select: { id: true, title: true, items: true, createdAt: true },
  });
  if (!scan) notFound();

  const items = parseItems(scan.items, MAX_ITEMS);
  const summary = summarise(items);
  const ids = items.map((i) => i.lexemeId).filter((id): id is string => id !== null);

  const [snapshot, lexemes] = await Promise.all([
    deckSnapshot(ownerId),
    ids.length
      ? prisma.lexeme.findMany({
          where: { id: { in: ids } },
          select: {
            id: true, lemma: true, translation: true, pos: true, cefr: true,
            gradationNote: true, provenance: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const byId = new Map(lexemes.map((l) => [l.id, l]));
  // The page's own order, which is the order it is printed in. A learner
  // checking the screen against the paper reads down both at once.
  const words = items
    .map((item) => ({ item, lexeme: item.lexemeId ? byId.get(item.lexemeId) : undefined }))
    .filter((row) => row.lexeme !== undefined);

  const progress = unitProgress({
    availableLemmas: words.map((w) => w.lexeme!.lemma),
    startedLemmas: [...snapshot.startedLemmas],
    knownLemmas: [...snapshot.knownLemmas],
  });

  const inDeck = progress.started;
  const unverified = words.filter((w) => w.lexeme!.provenance === "USER").length;

  return (
    <Page
      eyebrow="From paper"
      title={scan.title}
      lead={`${summary.total} word${summary.total === 1 ? "" : "s"} read off this page.`}
      actions={
        <Link href="/scan" className="flex items-center gap-1.5 text-sm" style={{ color: "var(--accent-deep)" }}>
          <ArrowLeft size={14} aria-hidden /> All pages
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        <Card className="flex flex-wrap items-center gap-5">
          <Ring pct={progress.pct} size={70} label={`${progress.pct}% of this page learned`}>
            <span className="text-base font-bold" style={{ color: "var(--accent-deep)" }}>
              {progress.pct}%
            </span>
          </Ring>
          <div className="min-w-0 flex-1">
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {progress.known} of {progress.available} known · {inDeck} in your deck
            </p>
            <div className="mt-2 max-w-sm">
              <Meter
                pct={progress.pct}
                label={`${scan.title}: ${progress.pct}% learned`}
                tone={progress.state === "done" ? "var(--good)" : "var(--accent)"}
              />
            </div>
          </div>
          <ScanActions scanId={scan.id} title={scan.title} pending={progress.available - inDeck} />
        </Card>

        {inDeck > 0 && (
          <section>
            <SectionTitle>Practise this page</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-3">
              <PractiseTile
                href={`/review?scan=${scan.id}`}
                tone="accent"
                title="Drill the page"
                body="Just these words, scheduling ignored, graded into the same log as everything else."
              />
              <PractiseTile
                href="/review/match"
                tone="sky"
                title="Match"
                body="Eight pairs against the clock, drawn from what is due across your deck."
              />
              <PractiseTile
                href="/review/sprint"
                tone="peach"
                title="Sprint"
                body="Sixty seconds. The fastest way to find out which of these has not stuck."
              />
            </div>
          </section>
        )}

        {unverified > 0 && (
          <Note tone="again">
            {unverified} of these {unverified === 1 ? "word was" : "words were"} not in the
            dictionary when this page was read, so {unverified === 1 ? "it carries" : "they carry"} the
            English from the photo and no verified forms. Open one in the dictionary to correct it,
            and it is corrected everywhere.
          </Note>
        )}

        <section>
          <SectionTitle hint={summary.inflected > 0 ? `${summary.inflected} inflected on the page` : undefined}>
            The words
          </SectionTitle>
          <ul className="flex flex-col gap-2">
            {words.map(({ item, lexeme }) => (
              <li key={lexeme!.id}>
                <Card as="div" className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Speak text={lexeme!.lemma} label={`Say ${lexeme!.lemma}`} />
                  <Link href={`/dictionary?q=${encodeURIComponent(lexeme!.lemma)}`} className="min-w-0 flex-1">
                    <span lang="et" className="block text-lg" style={{ color: "var(--ink)" }}>
                      {lexeme!.lemma}
                    </span>
                    <span className="block text-sm" style={{ color: "var(--ink-2)" }}>
                      {lexeme!.translation}
                    </span>
                    {item.matchedAs && (
                      <span className="block text-sm" style={{ color: "var(--sky-ink)" }}>
                        On the page as the {item.matchedAs}
                      </span>
                    )}
                  </Link>
                  <span className="flex flex-wrap items-center gap-2">
                    {lexeme!.cefr && <Chip tone="accent">{lexeme!.cefr}</Chip>}
                    {lexeme!.gradationNote && (
                      <Chip tone="hard" caseSensitive>{lexeme!.gradationNote}</Chip>
                    )}
                    {lexeme!.provenance === "USER" && <Chip tone="again">Unverified</Chip>}
                    {snapshot.knownLemmas.has(lexeme!.lemma) ? (
                      <Chip tone="good">Known</Chip>
                    ) : snapshot.startedLemmas.has(lexeme!.lemma) ? (
                      <Chip tone="sky">Learning</Chip>
                    ) : (
                      <Chip>Not started</Chip>
                    )}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  );
}

function PractiseTile({ href, tone, title, body }: {
  href: string; tone: "accent" | "sky" | "peach"; title: string; body: string;
}) {
  const Icon = tone === "accent" ? GraduationCap : tone === "sky" ? Grid2x2 : Zap;
  return (
    <Card as="div" hover tone={tone} className="p-0">
      <Link href={href} className="flex h-full min-h-24 flex-col gap-1.5 p-5">
        <span className="flex items-center gap-2 font-semibold" style={{ color: "var(--ink)" }}>
          <Icon size={16} aria-hidden />
          {title}
        </span>
        <span className="text-sm" style={{ color: "var(--ink-2)" }}>{body}</span>
      </Link>
    </Card>
  );
}
