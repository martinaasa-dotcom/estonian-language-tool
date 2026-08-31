import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { CaseAccuracy } from "@/lib/stats/history";
import type { StickingPoint } from "@/lib/stats/sticking";
import { StickingPoints } from "@/components/StickingPoints";
import { WeakestCases } from "@/components/WeakestCases";
import { Card, SectionTitle } from "@/components/ui";

/**
 * THE WORDS AND THE CASES THAT KEEP GOING WRONG, ON THE PAGE SOMEBODY OPENS.
 *
 * Both halves of this existed and neither was on Today. The cards that keep
 * lapsing were on Progress, four scroll-lengths down a page of charts, and the
 * weakest cases were on Progress and Practice. So the two most actionable
 * things the app knows about a learner were the two furthest from the button
 * they press every morning.
 *
 * Nothing here is a new calculation and nothing here is new markup, which is
 * deliberate: `stickingPoints` and `caseAccuracy` are the one answer each, and
 * `StickingPoints` and `WeakestCases` are the one component each. This is a
 * heading and a link. A third drawing of "your weakest cases" is how one
 * learner ends up reading two different numbers for the comitative.
 *
 * Three of each rather than the full list, and a way through to both. A home
 * page tells you there is something to look at; the page it links to is where
 * you look at it.
 */
export function StruggleAreas({ sticking, cases, className }: {
  sticking: StickingPoint[];
  cases: CaseAccuracy[];
  className?: string;
}) {
  if (sticking.length === 0 && cases.length === 0) return null;

  return (
    <Card className={className}>
      <SectionTitle hint="worst first">What is fighting you</SectionTitle>

      {sticking.length > 0 && (
        <div className="mb-5">
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Words</h3>
          <StickingPoints points={sticking} />
        </div>
      )}

      {cases.length > 0 && (
        <div>
          <h3 className="label-xs mb-2" style={{ color: "var(--ink-3)" }}>Cases</h3>
          <WeakestCases cases={cases} empty={null} />
        </div>
      )}

      <Link
        href="/progress"
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold"
        style={{ color: "var(--accent-deep)" }}
      >
        The whole picture, with the charts behind it <ArrowRight size={13} aria-hidden />
      </Link>
    </Card>
  );
}
