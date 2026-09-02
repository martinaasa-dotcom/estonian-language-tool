import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, CalendarClock } from "lucide-react";
import type { ExamCountdown } from "@/lib/progress/countdown";
import { EVIDENCE_LABEL } from "@/lib/exam/readiness";
import { PASS_PCT } from "@/lib/exam/spec";
import { ButtonLink } from "@/components/Button";
import { LocalDate } from "@/components/LocalDate";
import { Card, Ring, SectionTitle } from "@/components/ui";

/**
 * THE DATE THEY GAVE US, ON THE SCREEN THEY OPEN.
 *
 * Somebody says at first run that they want B1 by March, and until now the one
 * page they see every morning had never mentioned it again. Two numbers side by
 * side are what make a morning decision: forty-seven days and sixty-two percent
 * is a different feeling from forty-seven days and thirty-one, and neither of
 * them is "43 cards due".
 *
 * THE TIER IS NOT OPTIONAL AND IS NOT A TOOLTIP. A confidence figure with no
 * account of what it rests on is the one thing this feature must not ship
 * (ADR-022), and a `title` attribute is a hover, which is nothing at all on the
 * phone this app is measured on. So it is printed, in words, under the number,
 * from the same table the examination hub reads.
 *
 * The colour is a claim rather than decoration: mint means "you would pass"
 * and the accent means "not yet", which is the palette's own rule about a hue
 * carrying meaning, and the percentage says the same thing in digits so the
 * colour is never the only channel.
 */
export function ExamCountdownCard({ countdown, zone, className }: {
  countdown: ExamCountdown;
  /** The learner's zone, so the date reads as their date. */
  zone: string | undefined;
  className?: string;
}) {
  const passing = countdown.confidence >= PASS_PCT;
  const gone = countdown.daysLeft !== null && countdown.daysLeft < 0;

  return (
    <Card tone={passing ? "mint" : "accent"} className={className}>
      <SectionTitle hint={countdown.phrase ?? "no date set"}>Your exam</SectionTitle>

      <div className="flex flex-wrap items-center gap-4">
        <Ring
          pct={countdown.confidence}
          size={68}
          tone={passing ? "var(--mint)" : "var(--accent)"}
          // This card is tinted, so the ring's own default track vanishes into it.
          track="var(--rule)"
          label={`${countdown.confidence} percent likely to pass ${countdown.band}`}
        >
          <span className="tnum text-md font-bold" style={{ color: "var(--ink)" }}>
            {countdown.confidence}%
          </span>
        </Ring>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-tight" style={{ color: "var(--ink)" }}>
            {countdown.band}, {countdown.label}
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
            {countdown.confidence}% likely to pass
          </p>
          {/*
            What the number is worth, beside the number. The hub prints the long
            form of this under its own heading; there is no room for a sentence
            here and there is room for three words.
          */}
          <p className="text-xs" style={{ color: "var(--ink-3)" }}>
            {countdown.measured ? "from a paper you sat" : EVIDENCE_LABEL[countdown.evidence]}
          </p>
        </div>
      </div>

      {countdown.deadline && (
        <p className="mt-3.5 flex items-center gap-1.5 text-sm" style={{ color: "var(--ink-2)" }}>
          <CalendarClock size={14} aria-hidden style={{ color: "var(--ink-3)" }} />
          {gone ? "That date has already passed: " : "Your date: "}
          {/*
            The reader's own date order and month names, which only their
            browser knows. Rendered on a server, `undefined` as a locale is the
            deployment's, so this read "October 15" to somebody in Tartu who
            writes "15. oktoober".
          */}
          <LocalDate
            iso={countdown.deadline}
            zone={zone}
            options={{ day: "numeric", month: "long" }}
            fallback={new Intl.DateTimeFormat(undefined, {
              timeZone: zone, day: "numeric", month: "long",
            }).format(new Date(countdown.deadline))}
          />
        </p>
      )}

      {/*
        What is in the way, in the readiness module's own ranked words rather
        than a sentence written here. The version written here reported a part
        the app has no evidence about as "predicted at 0", which reads as
        failing something you have not attempted.
      */}
      <p className="mt-2.5 text-sm leading-relaxed" style={{ color: "var(--ink-2)" }}>
        {passing ? (
          "Based on what we've seen so far, you would pass if you sat it today."
        ) : countdown.gap ? (
          <>
            {countdown.gap.title}.{" "}
            {countdown.gap.href && countdown.gap.cta && (
              <Link
                href={countdown.gap.href}
                className="font-semibold underline underline-offset-2"
                style={{ color: "var(--accent-deep)" }}
              >
                {countdown.gap.cta}
              </Link>
            )}
          </>
        ) : (
          "We don't have enough here yet to tell you what's slowing you down."
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ButtonLink href="/exam" variant="secondary" size="sm">
          Where you stand <ArrowRight size={14} aria-hidden />
        </ButtonLink>
        <Link
          href="/settings#goals"
          className="text-sm underline underline-offset-4"
          style={{ color: "var(--ink-3)" }}
        >
          Change the goal
        </Link>
      </div>
    </Card>
  );
}
