import Link from "next/link";
import { ArrowRight, Microscope } from "lucide-react";
import { prisma } from "@/lib/db";
import { diagnose, reviewsNeeded, type ReviewFact } from "@/lib/analysis/diagnosis";
import { Card, SectionTitle } from "@/components/ui";

/**
 * The diagnosis panel.
 *
 * Reads the review log joined against the lexemes the reviews were of — the
 * join that `Review.lexemeId` was denormalised for. A card that has since been
 * deleted still contributes, because its review outlived it.
 */
export async function Diagnosis({ ownerId }: { ownerId: string }) {
  const reviews = await prisma.review.findMany({
    where: { ownerId, targetCase: { not: null } },
    select: { targetCase: true, rating: true, lexemeId: true },
    orderBy: { reviewedAt: "desc" },
    take: 4000,
  });

  const lexemeIds = [...new Set(reviews.map((r) => r.lexemeId).filter((id): id is string => !!id))];
  const lexemes = lexemeIds.length
    ? await prisma.lexeme.findMany({
        where: { id: { in: lexemeIds } },
        select: {
          id: true, lemma: true, gradation: true,
          forms: { where: { formType: "GEN_PL" }, select: { value: true } },
        },
      })
    : [];

  const byId = new Map(lexemes.map((l) => [l.id, l]));

  const facts: ReviewFact[] = reviews.flatMap((r) => {
    const lexeme = r.lexemeId ? byId.get(r.lexemeId) : undefined;
    if (!lexeme) return [];
    return [{
      targetCase: r.targetCase,
      rating: r.rating,
      gradation: lexeme.gradation,
      // A stored genitive plural means the plural could not be derived from the
      // singular stem — the irregular case, and a distinct kind of difficulty.
      hasIrregularPlural: lexeme.forms.length > 0,
      lemma: lexeme.lemma,
    }];
  });

  const findings = diagnose(facts);
  const needed = reviewsNeeded(facts);

  if (findings.length === 0) {
    return (
      <section>
        <SectionTitle>Diagnosis</SectionTitle>
        <Card>
          <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
            {needed > 0
              ? <>Not enough case reviews yet to say anything useful. About {needed} more and this
                  will start telling you which stems are actually costing you.</>
              : <>Nothing stands out. Your accuracy is even across cases and stem types, which is
                  the boring answer and the good one.</>}
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section>
      <SectionTitle hint="from your review log">Diagnosis</SectionTitle>
      <div className="flex flex-col gap-3">
        {findings.map((finding) => (
          <Card key={finding.headline}>
            <div className="flex items-start gap-3">
              <Microscope size={17} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold" style={{ color: "var(--ink)" }}>
                  {finding.headline}
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--ink-2)" }}>
                  {finding.detail}
                </p>

                <div className="mt-3 flex items-center gap-4">
                  <Bar label="in that group" pct={finding.weakPct} fill="var(--again)" ink="var(--again-ink)" />
                  <Bar label="elsewhere" pct={finding.strongPct} fill="var(--good)" ink="var(--good-ink)" />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>
                    from {finding.sample} reviews
                  </span>
                  <Link
                    href={finding.href}
                    className="flex items-center gap-1.5 text-[13.5px]"
                    style={{ color: "var(--accent-deep)" }}
                  >
                    Drill it <ArrowRight size={13} aria-hidden />
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

/**
 * A labelled percentage over a bar.
 *
 * The hue arrives twice on purpose. `fill` is the bar itself, where mint and
 * peach carry their fixed meanings, recalled and missed. `ink` is the number,
 * which is small text on a card and has to clear WCAG AA: the fill hues do not
 * (peach measured 2.97:1 and mint 2.52:1), which is exactly why the design
 * system defines `--again-ink` and `--good-ink` as the readable versions of
 * the same colours. Using the fill for both is the mistake this signature
 * makes hard to repeat.
 */
function Bar({ label, pct, fill, ink }: { label: string; pct: number; fill: string; ink: string }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px]" style={{ color: "var(--ink-3)" }}>{label}</span>
        <span className="tnum text-[13.5px] font-semibold" style={{ color: ink }}>{pct}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--raised)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: fill }} />
      </div>
    </div>
  );
}
