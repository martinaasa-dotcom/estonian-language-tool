import { Card, SectionTitle } from "@/components/ui";
import { formatMicros } from "@/lib/usage/pricing";
import { usageToday } from "@/lib/usage/ledger";
import { audioCacheIsDurable } from "@/lib/audio/store";

/**
 * What the learner has used today, and what the ceiling is.
 *
 * Shown rather than hidden because a limit you meet without warning feels like a
 * bug. The bar is about calls, not money: the amount is the honest number but it
 * is not what anyone is budgeting in their head.
 */
export async function UsagePanel({ ownerId }: { ownerId: string }) {
  const { calls, micros, limits } = await usageToday(ownerId);
  const pct = limits.dailyCallsPerUser
    ? Math.min(100, Math.round((calls / limits.dailyCallsPerUser) * 100))
    : 0;

  return (
    <section>
      <SectionTitle hint="resets at midnight UTC">Anu today</SectionTitle>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[13.5px]" style={{ color: "var(--ink-2)" }}>
            <span className="tnum" style={{ color: "var(--ink)" }}>{calls}</span>
            {" of "}
            <span className="tnum">{limits.dailyCallsPerUser}</span> questions
          </p>
          <p className="tnum text-[13px]" style={{ color: "var(--ink-3)" }}>
            {formatMicros(micros)} of {formatMicros(limits.dailyMicrosPerUser)}
          </p>
        </div>

        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={calls}
          aria-valuemin={0}
          aria-valuemax={limits.dailyCallsPerUser}
          aria-label="Tutor questions used today"
          style={{ background: "var(--raised)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: pct >= 90 ? "var(--again)" : "var(--accent)",
            }}
          />
        </div>

        <p className="mt-3 text-[13px]" style={{ color: "var(--ink-3)" }}>
          Only the tutor is metered. Review, the dictionary and your deck have no limit and keep
          working when this runs out.
        </p>

        {!audioCacheIsDurable() && (
          <p className="mt-2 text-[13px]" style={{ color: "var(--ink-3)" }}>
            Pronunciation audio is cached on local disk. Set{" "}
            <code>SUPABASE_SERVICE_ROLE_KEY</code> to share one cache across every instance and
            stop re-asking TartuNLP for words it has already spoken.
          </p>
        )}
      </Card>
    </section>
  );
}
